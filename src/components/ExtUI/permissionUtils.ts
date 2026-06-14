/**
 * Shared utility functions for rendering file mutation previews (diffs).
 * Used by ToolCall.tsx (chat history) and PendingToolCallBlock (inline permission card).
 */

import { diffLines } from "diff";

// ============================================================================
// Types
// ============================================================================

export interface EditItem {
  oldText: string;
  newText: string;
}

export interface DiffPreview {
  path: string;
  diff: string;
  added: number;
  removed: number;
}

// ============================================================================
// Helpers
// ============================================================================

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export function textLineCount(text: string): number {
  if (text.length === 0) return 0;
  return text.split(/\r?\n/).length;
}

// ============================================================================
// Tool name detection
// ============================================================================

export function isFileMutationTool(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === "write" || lower === "edit";
}

// ============================================================================
// Input data extraction
// ============================================================================

function stringField(record: Record<string, unknown>, names: string[]): string | undefined {
  for (const name of names) {
    if (typeof record[name] === "string") return record[name] as string;
  }
  return undefined;
}

/** Extract file path from tool input args (works for write, edit, and any tool with path/filePath/filename) */
export function filePathFromInput(input: unknown): string {
  const record = asRecord(input);
  return stringField(record, ["path", "file_path", "filePath", "filename"]) ?? "unknown file";
}

/** Extract edits[] array from tool input args (works for edit tool) */
export function editItems(input: unknown): EditItem[] {
  const record = asRecord(input);
  const rawEdits = record.edits;
  const parsedEdits = typeof rawEdits === "string" ? parseJson(rawEdits) : rawEdits;
  const edits = Array.isArray(parsedEdits)
    ? parsedEdits
        .map((item) => {
          const edit = asRecord(item);
          const oldText = typeof edit.oldText === "string" ? edit.oldText : undefined;
          const newText = typeof edit.newText === "string" ? edit.newText : undefined;
          return oldText != null && newText != null ? { oldText, newText } : null;
        })
        .filter((item): item is EditItem => item != null)
    : [];
  const oldText = typeof record.oldText === "string" ? record.oldText : undefined;
  const newText = typeof record.newText === "string" ? record.newText : undefined;
  if (oldText != null && newText != null) return [...edits, { oldText, newText }];
  return edits;
}

// ============================================================================
// Diff construction
// ============================================================================

/**
 * Build a unified-diff-like string from an array of edits.
 * Uses proper line-by-line diff: unchanged context lines get `  ` prefix,
 * only truly changed lines are marked `-`/`+` with colour.
 *
 * When `fileContent` is provided, computes ABSOLUTE line numbers in the file
 * by finding each oldText position. Otherwise uses relative numbering (1-based).
 */
export function buildEditInputDiff(edits: EditItem[], fileContent?: string): string {
  // Pre-compute start line for each edit when file content is available
  const startLines: number[] = [];
  if (fileContent) {
    for (const edit of edits) {
      const idx = fileContent.indexOf(edit.oldText);
      if (idx !== -1) {
        // Line number = number of newlines before match + 1
        const before = fileContent.slice(0, idx);
        startLines.push((before.match(/\n/g) || []).length + 1);
      } else {
        startLines.push(1);
      }
    }
  } else {
    // Relative numbering: each edit starts at line 1 within oldText
    for (const _ of edits) startLines.push(1);
  }

  const output: string[] = [];
  for (const [i, edit] of edits.entries()) {
    const editStartLine = startLines[i];

    if (edits.length > 1) {
      output.push(` ${i + 1} ...`);
    }

    const changes = diffLines(edit.oldText, edit.newText);
    let oldLine = editStartLine;
    let newLine = editStartLine;
    // Determine width for padding
    let maxLine = newLine;
    for (const part of changes) {
      const rawLines = part.value.split(/\r?\n/).filter(l => l.length > 0 || l === "");
      if (rawLines.length > 0 && rawLines[rawLines.length - 1] === "") rawLines.pop();
      const count = rawLines.length;
      if (part.added) maxLine = Math.max(maxLine, newLine + count - 1);
      else if (part.removed) maxLine = Math.max(maxLine, oldLine + count - 1);
      else {
        maxLine = Math.max(maxLine, oldLine + count - 1, newLine + count - 1);
      }
      if (!part.added) oldLine += count;
      if (!part.removed) newLine += count;
    }
    // Reset counters for actual output
    oldLine = editStartLine;
    newLine = editStartLine;
    const padWidth = Math.max(3, String(maxLine).length);

    for (const part of changes) {
      const rawLines = part.value.split(/\r?\n/);
      // Remove trailing empty line
      if (rawLines.length > 0 && rawLines[rawLines.length - 1] === "") {
        rawLines.pop();
      }
      for (const line of rawLines) {
        if (part.added) {
          output.push(`+${String(newLine).padStart(padWidth, " ")} ${line}`);
          newLine++;
        } else if (part.removed) {
          output.push(`-${String(oldLine).padStart(padWidth, " ")} ${line}`);
          oldLine++;
        } else {
          output.push(` ${String(oldLine).padStart(padWidth, " ")} ${line}`);
          oldLine++;
          newLine++;
        }
      }
    }
  }
  return output.join("\n");
}

/** Build a diff-like string for a write tool: all lines prefixed with + and line numbers */
export function buildWriteDiff(content: string): string {
  return content
    .split(/\r?\n/)
    .map((line, index) => `+${String(index + 1).padStart(4, " ")} ${line}`)
    .join("\n");
}

// ============================================================================
// Diff analysis
// ============================================================================

export function diffStats(diff: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) added += 1;
    else if (line.startsWith("-")) removed += 1;
  }
  return { added, removed };
}

export function diffLineClass(line: string): string {
  if (line.startsWith("+") && !line.startsWith("+++")) return "bg-(--color-success)/10 text-(--color-success)";
  if (line.startsWith("-") && !line.startsWith("---")) return "bg-(--color-danger)/10 text-(--color-danger)";
  if (line.trim() === "..." || /^\s+\d*\s*\.\.\./.test(line)) return "text-(--color-fg-dim)";
  return "text-(--color-fg-mute)";
}

// ============================================================================
// Full preview builder (from raw tool args)
// ============================================================================

/**
 * Build a diff preview from tool input args.
 * Works with both write and edit tool inputs.
 * Optional `fileContent` enables absolute line numbers in the diff.
 */
export function buildFileMutationPreviewFromInput(input: unknown, path?: string, fileContent?: string): DiffPreview {
  const record = asRecord(input);
  const resolvedPath = path ?? filePathFromInput(input);

  // Write tool: has `content` field
  if (typeof record.content === "string") {
    const content = record.content as string;
    return {
      path: resolvedPath,
      diff: buildWriteDiff(content),
      added: textLineCount(content),
      removed: 0,
    };
  }

  // Edit tool: has `edits[]` or `oldText`/`newText`
  const edits = editItems(input);
  const diff = buildEditInputDiff(edits, fileContent);
  const stats = diffStats(diff);
  if (stats.added > 0 || stats.removed > 0) {
    return { path: resolvedPath, diff, added: stats.added, removed: stats.removed };
  }

  return {
    path: resolvedPath,
    diff,
    added: edits.reduce((total, edit) => total + textLineCount(edit.newText), 0),
    removed: edits.reduce((total, edit) => total + textLineCount(edit.oldText), 0),
  };
}

/**
 * Async version: reads the file at `path` and then builds the diff preview
 * with absolute line numbers. Falls back to sync version if file cannot be read.
 */
export async function buildFileMutationPreviewFromFile(
  input: unknown,
  path: string,
): Promise<DiffPreview> {
  try {
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    const content = await readTextFile(path);
    return buildFileMutationPreviewFromInput(input, path, content);
  } catch {
    // Fallback: no file content, relative line numbers
    return buildFileMutationPreviewFromInput(input, path);
  }
}

// ============================================================================
// Short input display
// ============================================================================

export function shortInput(input: unknown): string {
  if (input == null) return "";
  if (typeof input === "string") return input;
  try {
    const str = JSON.stringify(input);
    if (str.length < 80) return str;
    if (input && typeof input === "object") {
      const o = input as Record<string, unknown>;
      for (const k of ["file_path", "filePath", "path", "command", "url", "query"]) {
        if (typeof o[k] === "string") return String(o[k]);
      }
    }
    return str.slice(0, 80) + "…";
  } catch {
    return String(input);
  }
}

export function pretty(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
