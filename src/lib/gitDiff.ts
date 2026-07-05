import { parsePatch } from "diff";

export type DiffLineType = "context" | "add" | "del";

export interface ParsedDiffLine {
  type: DiffLineType;
  oldLineNo: number | null;
  newLineNo: number | null;
  text: string;
}

export interface ParsedDiffHunk {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: ParsedDiffLine[];
}

export interface ParsedFileDiff {
  hunks: ParsedDiffHunk[];
  isBinary: boolean;
}

function hunkHeader(oldStart: number, oldLines: number, newStart: number, newLines: number): string {
  return `@@ -${oldStart},${oldLines} +${newStart},${newLines} @@`;
}

/** Разбирает один raw git unified-diff (уже выделенный для одного файла бэкендом) в структурированные hunks. */
export function parseFileDiff(rawDiffText: string): ParsedFileDiff {
  if (!rawDiffText.trim()) return { hunks: [], isBinary: false };

  const [patch] = parsePatch(rawDiffText);
  if (!patch || patch.isBinary) {
    return { hunks: [], isBinary: Boolean(patch?.isBinary) };
  }

  const hunks: ParsedDiffHunk[] = patch.hunks.map((hunk) => {
    let oldLineNo = hunk.oldStart;
    let newLineNo = hunk.newStart;
    const lines: ParsedDiffLine[] = hunk.lines
      .filter((line) => line.length > 0 && !line.startsWith("\\"))
      .map((line) => {
        const prefix = line[0];
        const text = line.slice(1);
        if (prefix === "+") {
          const parsed: ParsedDiffLine = { type: "add", oldLineNo: null, newLineNo, text };
          newLineNo += 1;
          return parsed;
        }
        if (prefix === "-") {
          const parsed: ParsedDiffLine = { type: "del", oldLineNo, newLineNo: null, text };
          oldLineNo += 1;
          return parsed;
        }
        const parsed: ParsedDiffLine = { type: "context", oldLineNo, newLineNo, text };
        oldLineNo += 1;
        newLineNo += 1;
        return parsed;
      });
    return {
      header: hunkHeader(hunk.oldStart, hunk.oldLines, hunk.newStart, hunk.newLines),
      oldStart: hunk.oldStart,
      oldLines: hunk.oldLines,
      newStart: hunk.newStart,
      newLines: hunk.newLines,
      lines,
    };
  });

  return { hunks, isBinary: false };
}

const EXT_LANG: Record<string, string> = {
  ts: "ts", tsx: "tsx", js: "js", jsx: "jsx", rs: "rust", py: "python", go: "go",
  rb: "ruby", java: "java", c: "c", h: "c", cpp: "cpp", cc: "cpp", hpp: "cpp",
  css: "css", scss: "scss", html: "html", json: "json", md: "markdown",
  sh: "bash", yml: "yaml", yaml: "yaml", toml: "toml", sql: "sql",
};

function langForPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return EXT_LANG[ext] ?? "";
}

/** Начальный плоский индекс каждого hunk'а в объединённом списке строк всех hunk'ов. */
export function hunkOffsets(hunks: ParsedDiffHunk[]): number[] {
  let acc = 0;
  return hunks.map((h) => {
    const start = acc;
    acc += h.lines.length;
    return start;
  });
}

export interface ChangeGroup {
  startFlatIdx: number;
  endFlatIdx: number;
}

/**
 * Группирует add/del-строки в логические блоки изменений по плоскому списку строк.
 * Бэкенд всегда отдаёт diff с полным контекстом файла (-U100000, см. git_diff.rs),
 * поэтому `parseFileDiff` всегда возвращает ровно один hunk на файл — реальные
 * границы "кусков правок" нужно вычислять здесь, объединяя соседние add/del-раны,
 * если между ними меньше 2*contextLines строк контекста (как это сделал бы сам git
 * при выводе с ограниченным контекстом).
 */
export function groupChangedLines(lines: ParsedDiffLine[], contextLines = 8): ChangeGroup[] {
  const groups: ChangeGroup[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].type === "context") {
      i++;
      continue;
    }
    let j = i;
    while (j < lines.length && lines[j].type !== "context") j++;
    const prev = groups[groups.length - 1];
    if (prev && i - prev.endFlatIdx - 1 <= contextLines * 2) {
      prev.endFlatIdx = j - 1;
    } else {
      groups.push({ startFlatIdx: i, endFlatIdx: j - 1 });
    }
    i = j;
  }
  return groups;
}

/** Индекс группы изменений, содержащей (или ближайшей к) плоский индекс строки flatIdx. */
export function groupIndexForFlatLine(groups: ChangeGroup[], flatIdx: number): number {
  for (let i = 0; i < groups.length; i++) {
    if (flatIdx <= groups[i].endFlatIdx) return i;
  }
  return Math.max(0, groups.length - 1);
}

/** Ближайший известный newLineNo от idx и правее; если хвост — сплошные del-строки, ищем левее. */
export function nearestNewLineNo(lines: ParsedDiffLine[], idx: number): number | null {
  for (let i = idx; i < lines.length; i++) if (lines[i].newLineNo != null) return lines[i].newLineNo;
  for (let i = idx; i >= 0; i--) if (lines[i].newLineNo != null) return lines[i].newLineNo;
  return null;
}

/** Форматирует выделенный диапазон строк диффа как ссылку для вставки в чат. */
export function formatDiffReference(path: string, lines: ParsedDiffLine[], startLine: number, endLine: number): string {
  const lang = langForPath(path);
  const rangeLabel = startLine === endLine ? `${startLine}` : `${startLine}-${endLine}`;
  const snippet = lines.map((l) => l.text).join("\n");
  return `\`${path}:${rangeLabel}\`\n\`\`\`${lang}\n${snippet}\n\`\`\``;
}
