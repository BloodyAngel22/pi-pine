/**
 * Shared utility functions for rendering file mutation previews (diffs).
 * Used by ToolCall.tsx (chat history) and PendingToolCallBlock (inline permission card).
 */

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

/** Build a unified-diff-like string from an array of edits */
export function buildEditInputDiff(edits: EditItem[]): string {
  const lines: string[] = [];
  edits.forEach((edit, index) => {
    if (edits.length > 1) lines.push(` ${index + 1} ...`);
    for (const line of edit.oldText.split(/\r?\n/)) lines.push(`- ${line}`);
    for (const line of edit.newText.split(/\r?\n/)) lines.push(`+ ${line}`);
  });
  return lines.join("\n");
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
 */
export function buildFileMutationPreviewFromInput(input: unknown, path?: string): DiffPreview {
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
  const diff = buildEditInputDiff(edits);
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
