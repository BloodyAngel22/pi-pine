import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Search, X } from "@/components/ui/icons/compat";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { parseFileDiff, type ParsedDiffLine } from "@/lib/gitDiff";
import type { ChangedFile, FileStatus } from "@/store/diff";
import { modalOverlayVariants, popoverContentVariants, softEase } from "@/lib/motionPresets";

interface Props {
  open: boolean;
  onClose(): void;
  files: ChangedFile[];
  selectedFile: ChangedFile | null;
  diffText: string;
  onSelectFile(path: string): void;
  onJumpToLine(flatIdx: number): void;
}

type Mode = "content" | "filename";

const STATUS_LABEL: Record<FileStatus, string> = {
  modified: "M",
  added: "A",
  deleted: "D",
  renamed: "R",
  copied: "C",
  untracked: "U",
};

const STATUS_COLOR: Record<FileStatus, string> = {
  modified: "text-(--color-warning)",
  added: "text-(--color-success)",
  deleted: "text-(--color-danger)",
  renamed: "text-(--color-accent)",
  copied: "text-(--color-accent)",
  untracked: "text-(--color-fg-mute)",
};

function linePrefix(type: ParsedDiffLine["type"]): string {
  if (type === "add") return "+";
  if (type === "del") return "-";
  return " ";
}

function lineTextClass(type: ParsedDiffLine["type"]): string {
  if (type === "add") return "text-(--color-success)";
  if (type === "del") return "text-(--color-danger)";
  return "text-(--color-fg-mute)";
}

interface ContentMatch {
  flatIdx: number;
  line: ParsedDiffLine;
}

export function DiffSearchPalette({ open, onClose, files, selectedFile, diffText, onSelectFile, onJumpToLine }: Props) {
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [mode, setMode] = useState<Mode>("content");
  const reduceMotion = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setHighlight(0);
  }, [open]);

  const parsed = useMemo(
    () => (selectedFile && !selectedFile.binary ? parseFileDiff(diffText) : null),
    [selectedFile, diffText],
  );
  const flatLines = useMemo(() => parsed?.hunks.flatMap((h) => h.lines) ?? [], [parsed]);

  const contentMatches = useMemo<ContentMatch[]>(() => {
    const q = query.trim().toLowerCase();
    return flatLines
      .map((line, flatIdx) => ({ line, flatIdx }))
      .filter(({ line }) => !q || line.text.toLowerCase().includes(q));
  }, [flatLines, query]);

  const filenameMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return files;
    return files.filter((f) => f.path.toLowerCase().includes(q) || (f.oldPath ?? "").toLowerCase().includes(q));
  }, [files, query]);

  const matchCount = mode === "content" ? contentMatches.length : filenameMatches.length;

  useEffect(() => {
    setHighlight((current) => Math.min(current, Math.max(0, matchCount - 1)));
  }, [matchCount]);

  function setModeAndReset(next: Mode) {
    setMode(next);
    setQuery("");
    setHighlight(0);
    inputRef.current?.focus();
  }

  function pick(index: number) {
    if (mode === "content") {
      const match = contentMatches[index];
      if (!match) return;
      onJumpToLine(match.flatIdx);
    } else {
      const file = filenameMatches[index];
      if (!file) return;
      onSelectFile(file.path);
    }
    onClose();
  }

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div className="absolute inset-0 z-40 flex items-start justify-center pt-16">
          <motion.div
            className="absolute inset-0"
            onClick={onClose}
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={modalOverlayVariants(Boolean(reduceMotion))}
            transition={softEase}
          />
          <motion.div
            className="relative w-full max-w-[640px] mx-3 bg-(--color-bg-soft) border border-(--color-border) rounded-lg shadow-2xl flex flex-col max-h-[70vh] overflow-hidden"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={popoverContentVariants(Boolean(reduceMotion))}
            transition={softEase}
          >
            <div className="flex items-center gap-2 border-b border-(--color-border) px-2 py-1.5">
              <Search size={13} className="text-(--color-fg-dim)" />
              <input
                ref={inputRef}
                autoFocus
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setHighlight(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    onClose();
                    return;
                  }
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setHighlight((index) => (matchCount === 0 ? 0 : (index + 1) % matchCount));
                    return;
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setHighlight((index) => (matchCount === 0 ? 0 : index <= 0 ? matchCount - 1 : index - 1));
                    return;
                  }
                  if (event.key === "Enter") {
                    event.preventDefault();
                    pick(highlight);
                  }
                }}
                placeholder={mode === "content" ? "Поиск по содержимому diff…" : "Поиск по имени файла…"}
                className="flex-1 bg-transparent outline-none text-sm placeholder:text-(--color-fg-dim)"
              />
              <span className="text-[10px] text-(--color-fg-dim)">{matchCount}</span>
              <button type="button" onClick={onClose} className="text-(--color-fg-dim) hover:text-(--color-fg)">
                <X size={12} />
              </button>
            </div>
            <div className="flex items-center gap-1 border-b border-(--color-border) px-2 py-1.5">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setModeAndReset("content")}
                className={clsx(
                  "px-2 py-0.5 rounded text-[11px]",
                  mode === "content" ? "bg-(--color-bg-mute) text-(--color-fg)" : "text-(--color-fg-mute) hover:bg-(--color-bg-mute)/60",
                )}
              >
                Содержимое
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setModeAndReset("filename")}
                className={clsx(
                  "px-2 py-0.5 rounded text-[11px]",
                  mode === "filename" ? "bg-(--color-bg-mute) text-(--color-fg)" : "text-(--color-fg-mute) hover:bg-(--color-bg-mute)/60",
                )}
              >
                Имя файла
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {mode === "content" ? (
                !selectedFile ? (
                  <div className="px-3 py-4 text-xs text-(--color-fg-dim)">Выберите файл слева.</div>
                ) : selectedFile.binary ? (
                  <div className="px-3 py-4 text-xs text-(--color-fg-dim)">Бинарный файл — поиск недоступен.</div>
                ) : !parsed || parsed.hunks.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-(--color-fg-dim)">Нет текстовых изменений.</div>
                ) : contentMatches.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-(--color-fg-dim)">Ничего не найдено.</div>
                ) : (
                  contentMatches.map((match, index) => (
                    <button
                      key={match.flatIdx}
                      type="button"
                      onMouseEnter={() => setHighlight(index)}
                      onClick={() => pick(index)}
                      className={clsx(
                        "w-full flex items-start gap-2 text-left px-3 py-1.5 border-b border-(--color-border)/40 font-mono",
                        index === highlight ? "bg-(--color-bg-mute)" : "hover:bg-(--color-bg-mute)/60",
                      )}
                    >
                      <span className="w-9 shrink-0 text-right text-[10px] text-(--color-fg-dim)">
                        {match.line.newLineNo ?? match.line.oldLineNo ?? ""}
                      </span>
                      <span className={clsx("shrink-0", lineTextClass(match.line.type))}>{linePrefix(match.line.type)}</span>
                      <span className="flex-1 min-w-0 truncate text-xs text-(--color-fg-mute)">{match.line.text}</span>
                    </button>
                  ))
                )
              ) : files.length === 0 ? (
                <div className="px-3 py-4 text-xs text-(--color-fg-dim)">Нет изменений.</div>
              ) : filenameMatches.length === 0 ? (
                <div className="px-3 py-4 text-xs text-(--color-fg-dim)">Ничего не найдено.</div>
              ) : (
                filenameMatches.map((file, index) => (
                  <button
                    key={file.path}
                    type="button"
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => pick(index)}
                    className={clsx(
                      "w-full flex items-center gap-1.5 text-left px-3 py-1.5 border-b border-(--color-border)/40 text-xs",
                      index === highlight ? "bg-(--color-bg-mute)" : "hover:bg-(--color-bg-mute)/60",
                    )}
                  >
                    <span className={clsx("w-3 shrink-0 font-mono font-semibold text-center", STATUS_COLOR[file.status])}>
                      {STATUS_LABEL[file.status]}
                    </span>
                    <span className="flex-1 min-w-0 truncate font-mono">{file.path}</span>
                    {!file.binary && (file.additions > 0 || file.deletions > 0) && (
                      <span className="shrink-0 font-mono text-[10px] flex items-center gap-1">
                        {file.additions > 0 && <span className="text-(--color-success)">+{file.additions}</span>}
                        {file.deletions > 0 && <span className="text-(--color-danger)">-{file.deletions}</span>}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
            <div className="border-t border-(--color-border) px-2 py-1.5 text-[10px] text-(--color-fg-dim) flex items-center gap-2">
              <span><kbd className="pi-kbd">Enter</kbd> перейти</span>
              <span><kbd className="pi-kbd">Esc</kbd> закрыть</span>
              <span className="ml-auto"><kbd className="pi-kbd">Ctrl+F</kbd> search</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
