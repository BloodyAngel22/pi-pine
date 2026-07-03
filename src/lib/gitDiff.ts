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
