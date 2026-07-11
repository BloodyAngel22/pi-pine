//! Diff Viewer: агрегированный git-diff всех незакоммиченных изменений
//! (staged + unstaged + untracked) в рабочем дереве. Используется как
//! единственный источник правды для панели Diff — не связан с превью
//! отдельных tool-call'ов агента в чате.

use serde::Serialize;
use std::path::Path;
use std::process::Command;

/// Пустое дерево git — сентинел для diff в репозитории без коммитов
/// (unborn branch), где `HEAD` ещё не существует.
const EMPTY_TREE: &str = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

#[derive(Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum FileStatus {
    Modified,
    Added,
    Deleted,
    Renamed,
    Copied,
    Untracked,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChangedFile {
    pub path: String,
    pub old_path: Option<String>,
    pub status: FileStatus,
    pub binary: bool,
    pub staged: bool,
    pub additions: u32,
    pub deletions: u32,
    pub diff: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffResult {
    pub is_repo: bool,
    pub repo_root: Option<String>,
    pub files: Vec<ChangedFile>,
}

/// Запускает `git <args>` в каталоге `root`. `allow_exit_1` — для команд
/// вроде `git diff --no-index`, которые возвращают код 1, когда файлы
/// отличаются (это нормальный результат, а не ошибка).
fn run_git(root: &Path, args: &[&str], allow_exit_1: bool) -> Result<String, String> {
    let output = Command::new("git")
        .current_dir(root)
        .args(args)
        .output()
        .map_err(|e| format!("git {}: {}", args.join(" "), e))?;
    let code = output.status.code().unwrap_or(-1);
    let ok = code == 0 || (allow_exit_1 && code == 1);
    if !ok {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git {}: {}", args.join(" "), stderr.trim()));
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

struct StatusEntry {
    path: String,
    old_path: Option<String>,
    status: FileStatus,
    staged: bool,
}

/// Парсит `git status --porcelain=v1 -z` — NUL-разделённые записи,
/// корректно обрабатывает пробелы в именах и rename-записи (`old\0new\0`).
fn parse_porcelain(raw: &str) -> Vec<StatusEntry> {
    let mut tokens = raw.split('\0').filter(|t| !t.is_empty());
    let mut entries = Vec::new();
    while let Some(record) = tokens.next() {
        if record.len() < 3 {
            continue;
        }
        let x = record.as_bytes()[0] as char;
        let y = record.as_bytes()[1] as char;
        let path = record[3..].to_string();

        let (status, old_path) = if x == 'R' || x == 'C' {
            // Следующий токен — старое имя.
            let old = tokens.next().map(|s| s.to_string());
            (
                if x == 'R' {
                    FileStatus::Renamed
                } else {
                    FileStatus::Copied
                },
                old,
            )
        } else if x == '?' && y == '?' {
            (FileStatus::Untracked, None)
        } else if x == 'D' || y == 'D' {
            (FileStatus::Deleted, None)
        } else if x == 'A' {
            (FileStatus::Added, None)
        } else {
            (FileStatus::Modified, None)
        };

        let staged = x != ' ' && x != '?';
        entries.push(StatusEntry {
            path,
            old_path,
            status,
            staged,
        });
    }
    entries
}

/// Один сегмент unified-diff для файла (от `diff --git ...` до следующего
/// такого же заголовка или конца текста).
struct DiffSegment {
    /// Путь файла, извлечённый из заголовка `+++ b/<path>` (или `--- a/<path>`
    /// для удалённых файлов).
    path: String,
    binary: bool,
    text: String,
    additions: u32,
    deletions: u32,
}

/// Определяет, является ли diff-сегмент бинарным. Проверяет только
/// diff-метаданные (строки без префикса `+`/`-`), а не содержимое строк —
/// иначе добавленная строка кода, буквально содержащая текст
/// `"Binary files "` (как в этом самом файле), даст ложное срабатывание.
fn is_binary_diff(text: &str) -> bool {
    text.lines().any(|line| {
        !line.starts_with('+')
            && !line.starts_with('-')
            && (line.starts_with("Binary files ") || line.starts_with("GIT binary patch"))
    })
}

fn count_additions_deletions(body: &str) -> (u32, u32) {
    let mut additions = 0u32;
    let mut deletions = 0u32;
    for line in body.lines() {
        if line.starts_with("+++") || line.starts_with("---") {
            continue;
        }
        if line.starts_with('+') {
            additions += 1;
        } else if line.starts_with('-') {
            deletions += 1;
        }
    }
    (additions, deletions)
}

/// Извлекает путь файла из заголовка сегмента diff.
/// Приоритет: `+++ b/path` (обычный случай) → `rename to path` (rename
/// без изменения содержимого, где +++/--- отсутствуют) → `--- a/path`
/// (удалённые файлы) → `diff --git a/old b/new` (универсальный fallback).
fn extract_path_from_segment(segment: &str) -> Option<String> {
    let mut fallback: Option<String> = None;
    for line in segment.lines() {
        if let Some(rest) = line.strip_prefix("+++ ") {
            if rest.trim() == "/dev/null" {
                continue;
            }
            return Some(strip_ab_prefix(rest.trim()));
        }
        if let Some(rest) = line.strip_prefix("rename to ") {
            return Some(rest.trim().to_string());
        }
        if let Some(rest) = line.strip_prefix("--- ") {
            if rest.trim() != "/dev/null" {
                fallback = Some(strip_ab_prefix(rest.trim()));
            }
        }
    }
    fallback.or_else(|| extract_path_from_diff_git_header(segment))
}

/// Fallback-парсер: разбирает `diff --git a/<old> b/<new>` и возвращает `<new>`.
/// Не идеален для путей с пробелами (известное ограничение), но покрывает
/// все случаи, где +++/--- отсутствуют (чистый rename без изменения содержимого).
fn extract_path_from_diff_git_header(segment: &str) -> Option<String> {
    let first_line = segment.lines().next()?;
    let rest = first_line.strip_prefix("diff --git a/")?;
    let idx = rest.find(" b/")?;
    Some(rest[idx + 3..].to_string())
}

fn strip_ab_prefix(path: &str) -> String {
    path.strip_prefix("a/")
        .or_else(|| path.strip_prefix("b/"))
        .unwrap_or(path)
        .to_string()
}

/// Разбивает вывод `git diff` (может содержать несколько файлов) на сегменты
/// по границам `diff --git a/... b/...`.
fn split_diff_segments(raw: &str) -> Vec<DiffSegment> {
    let mut segments = Vec::new();
    let mut current: Option<String> = None;
    for line in raw.split_inclusive('\n') {
        if line.starts_with("diff --git ") {
            if let Some(text) = current.take() {
                segments.push(finish_segment(text));
            }
            current = Some(String::new());
        }
        if let Some(buf) = current.as_mut() {
            buf.push_str(line);
        }
    }
    if let Some(text) = current.take() {
        segments.push(finish_segment(text));
    }
    segments
}

fn finish_segment(text: String) -> DiffSegment {
    let binary = is_binary_diff(&text);
    let path = extract_path_from_segment(&text).unwrap_or_default();
    let (additions, deletions) = if binary {
        (0, 0)
    } else {
        count_additions_deletions(&text)
    };
    DiffSegment {
        path,
        binary,
        text,
        additions,
        deletions,
    }
}

/// Определяет корень git-репозитория для `cwd`, если он существует.
fn repo_root(cwd_path: &Path) -> Option<String> {
    run_git(cwd_path, &["rev-parse", "--show-toplevel"], false)
        .ok()
        .map(|s| s.trim().to_string())
}

/// Базовая точка сравнения для diff: `HEAD`, если он существует, иначе
/// пустое дерево (репозиторий без коммитов, unborn branch).
fn diff_base(root_path: &Path) -> &'static str {
    if run_git(root_path, &["rev-parse", "--verify", "HEAD"], false).is_ok() {
        "HEAD"
    } else {
        EMPTY_TREE
    }
}

#[tauri::command]
pub fn git_diff_status(cwd: String, context_lines: Option<u32>) -> Result<GitDiffResult, String> {
    let cwd_path = Path::new(&cwd);

    let root = match repo_root(cwd_path) {
        Some(root) => root,
        None => {
            return Ok(GitDiffResult {
                is_repo: false,
                repo_root: None,
                files: vec![],
            });
        }
    };
    let root_path = Path::new(&root);

    let context = context_lines.unwrap_or(8).to_string();
    let context_flag = format!("-U{}", context);

    let base = diff_base(root_path);

    // -uall: разворачивает untracked-директории в отдельные файлы, а не
    // схлопывает их в одну запись (иначе новая директория с несколькими
    // файлами показывалась бы как один нерасшифровываемый "файл").
    let status_raw = run_git(root_path, &["status", "--porcelain=v1", "-uall", "-z"], false)?;
    let entries = parse_porcelain(&status_raw);

    let tracked_diff = run_git(
        root_path,
        &["diff", base, &context_flag, "-M", "--no-color", "--", "."],
        false,
    )?;
    let tracked_segments = split_diff_segments(&tracked_diff);

    let mut files = Vec::new();
    for entry in entries {
        if entry.status == FileStatus::Untracked {
            let no_index = run_git(
                root_path,
                &[
                    "diff",
                    "--no-index",
                    "--no-color",
                    &context_flag,
                    "--",
                    "/dev/null",
                    &entry.path,
                ],
                true,
            )
            .unwrap_or_default();
            let binary = is_binary_diff(&no_index);
            let (additions, deletions) = if binary {
                (0, 0)
            } else {
                count_additions_deletions(&no_index)
            };
            files.push(ChangedFile {
                path: entry.path,
                old_path: None,
                status: FileStatus::Untracked,
                binary,
                staged: false,
                additions,
                deletions,
                diff: no_index,
            });
            continue;
        }

        let segment = tracked_segments.iter().find(|s| s.path == entry.path);
        let (binary, diff, additions, deletions) = match segment {
            Some(seg) => (seg.binary, seg.text.clone(), seg.additions, seg.deletions),
            None => (false, String::new(), 0, 0),
        };
        files.push(ChangedFile {
            path: entry.path,
            old_path: entry.old_path,
            status: entry.status,
            binary,
            staged: entry.staged,
            additions,
            deletions,
            diff,
        });
    }

    Ok(GitDiffResult {
        is_repo: true,
        repo_root: Some(root),
        files,
    })
}

/// Эффективно неограниченный контекст — используется при ленивой загрузке
/// полного диффа выбранного файла (Diff Viewer, итерация 2).
const FULL_CONTEXT_FLAG: &str = "-U100000";

/// Для файлов крупнее этого порога полный контекст не запрашиваем: `-U100000`
/// на многомегабайтном файле раздувает возвращаемую строку (и её копии при
/// сериализации в JSON → webview) до десятков МБ. Вместо этого используем
/// ограниченный, но всё ещё широкий контекст.
const FULL_CONTEXT_MAX_FILE_BYTES: u64 = 1_000_000;
const LARGE_FILE_CONTEXT_FLAG: &str = "-U200";

/// Выбор флага контекста по размеру файла на диске. Для удалённых файлов
/// (metadata недоступна) остаёмся на полном контексте — их содержимое уже
/// целиком входит в дифф независимо от `-U`.
fn context_flag_for(root: &Path, rel_path: &str) -> &'static str {
    match std::fs::metadata(root.join(rel_path)) {
        Ok(meta) if meta.len() > FULL_CONTEXT_MAX_FILE_BYTES => LARGE_FILE_CONTEXT_FLAG,
        _ => FULL_CONTEXT_FLAG,
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileDiffResult {
    pub diff: String,
    pub binary: bool,
}

/// Диф одного файла с полным контекстом (без обрезки по `-U<n>`, как в
/// `git_diff_status`). Вызывается лениво при открытии файла в Diff-панели.
#[tauri::command]
pub fn git_diff_file(cwd: String, path: String, untracked: bool) -> Result<FileDiffResult, String> {
    let cwd_path = Path::new(&cwd);
    let root = repo_root(cwd_path).ok_or_else(|| "not a git repository".to_string())?;
    let root_path = Path::new(&root);

    let context_flag = context_flag_for(root_path, &path);
    let raw = if untracked {
        run_git(
            root_path,
            &[
                "diff",
                "--no-index",
                "--no-color",
                context_flag,
                "--",
                "/dev/null",
                &path,
            ],
            true,
        )?
    } else {
        let base = diff_base(root_path);
        run_git(
            root_path,
            &["diff", base, context_flag, "-M", "--no-color", "--", &path],
            false,
        )?
    };
    let binary = is_binary_diff(&raw);
    Ok(FileDiffResult { diff: raw, binary })
}
