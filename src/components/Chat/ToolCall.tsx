import { useState } from "react";
import { ChevronDown, ChevronRight, Wrench, AlertCircle, MessageCircleQuestion, Bot, FileText, Globe } from "lucide-react";
import clsx from "clsx";
import type { UiBlockTool } from "@/store/chat";

function shortInput(input: unknown): string {
  if (input == null) return "";
  if (typeof input === "string") return input;
  try {
    const str = JSON.stringify(input);
    if (str.length < 80) return str;
    if (input && typeof input === "object") {
      const o = input as Record<string, unknown>;
      // самые частые поля для file/bash тулзов
      for (const k of ["file_path", "filePath", "path", "command", "url", "query"]) {
        if (typeof o[k] === "string") return String(o[k]);
      }
    }
    return str.slice(0, 80) + "…";
  } catch {
    return String(input);
  }
}

function pretty(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function isFileMutationTool(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === "write" || lower === "edit";
}

function stringField(record: Record<string, unknown>, names: string[]): string | undefined {
  for (const name of names) {
    if (typeof record[name] === "string") return record[name] as string;
  }
  return undefined;
}

function filePathFromInput(input: unknown): string {
  const record = asRecord(input);
  return stringField(record, ["path", "file_path", "filePath", "filename"]) ?? "unknown file";
}

function textLineCount(text: string): number {
  if (text.length === 0) return 0;
  return text.split(/\r?\n/).length;
}

interface EditItem {
  oldText: string;
  newText: string;
}

function editItems(input: unknown): EditItem[] {
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

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function detailsDiff(details: unknown): string | undefined {
  const record = asRecord(details);
  return typeof record.diff === "string" ? record.diff : undefined;
}

function buildEditInputDiff(edits: EditItem[]): string {
  const lines: string[] = [];
  edits.forEach((edit, index) => {
    if (edits.length > 1) lines.push(` ${index + 1} ...`);
    for (const line of edit.oldText.split(/\r?\n/)) lines.push(`- ${line}`);
    for (const line of edit.newText.split(/\r?\n/)) lines.push(`+ ${line}`);
  });
  return lines.join("\n");
}

function buildWriteDiff(content: string): string {
  return content
    .split(/\r?\n/)
    .map((line, index) => `+${String(index + 1).padStart(4, " ")} ${line}`)
    .join("\n");
}

function diffStats(diff: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) added += 1;
    else if (line.startsWith("-")) removed += 1;
  }
  return { added, removed };
}

function fileMutationPreview(block: UiBlockTool): {
  path: string;
  diff: string;
  added: number;
  removed: number;
} {
  const input = asRecord(block.input);
  const path = filePathFromInput(input);
  if (block.name.toLowerCase() === "write") {
    const content = typeof input.content === "string" ? input.content : "";
    return {
      path,
      diff: buildWriteDiff(content),
      added: textLineCount(content),
      removed: 0,
    };
  }
  const edits = editItems(input);
  const diff = detailsDiff(block.details) ?? buildEditInputDiff(edits);
  const stats = diffStats(diff);
  if (stats.added > 0 || stats.removed > 0) return { path, diff, added: stats.added, removed: stats.removed };
  return {
    path,
    diff,
    added: edits.reduce((total, edit) => total + textLineCount(edit.newText), 0),
    removed: edits.reduce((total, edit) => total + textLineCount(edit.oldText), 0),
  };
}

function diffLineClass(line: string): string {
  if (line.startsWith("+") && !line.startsWith("+++")) return "bg-(--color-success)/10 text-(--color-success)";
  if (line.startsWith("-") && !line.startsWith("---")) return "bg-(--color-danger)/10 text-(--color-danger)";
  if (line.trim() === "..." || /^\s+\d*\s*\.\.\./.test(line)) return "text-(--color-fg-dim)";
  return "text-(--color-fg-mute)";
}

function askUserQuestion(input: unknown): string {
  const o = asRecord(input);
  return String(o.question ?? o.title ?? "Ask user");
}

function askUserOptions(input: unknown): string[] {
  const raw = asRecord(input).options;
  if (!Array.isArray(raw)) return [];
  return raw.map((option) => {
    if (typeof option === "string") return option;
    const o = asRecord(option);
    return String(o.label ?? o.value ?? o.text ?? option);
  });
}

interface TodoItem {
  id: number;
  text: string;
  done: boolean;
}

function todoDetails(details: unknown): { todos: TodoItem[]; action?: string; error?: string } | null {
  const o = asRecord(details);
  const raw = o.todos;
  if (!Array.isArray(raw)) return null;
  const todos = raw
    .map((item) => {
      const todo = asRecord(item);
      return {
        id: Number(todo.id),
        text: String(todo.text ?? ""),
        done: todo.done === true,
      };
    })
    .filter((todo) => Number.isFinite(todo.id) && todo.text.length > 0);
  return {
    todos,
    action: typeof o.action === "string" ? o.action : undefined,
    error: typeof o.error === "string" ? o.error : undefined,
  };
}


function taskDetails(details: unknown): {
  description?: string;
  cwd?: string;
  inputTokens?: number;
  outputTokens?: number;
  savedTokens?: number;
} {
  const o = asRecord(details);
  return {
    description: typeof o.description === "string" ? o.description : undefined,
    cwd: typeof o.cwd === "string" ? o.cwd : undefined,
    inputTokens: typeof o.inputTokens === "number" ? o.inputTokens : undefined,
    outputTokens: typeof o.outputTokens === "number" ? o.outputTokens : undefined,
    savedTokens: typeof o.savedTokens === "number" ? o.savedTokens : undefined,
  };
}

function fastFetchDetails(details: unknown): {
  url?: string;
  mode?: string;
  status?: number;
  contentType?: string;
  truncated?: boolean;
  bytes?: number;
} {
  const o = asRecord(details);
  return {
    url: typeof o.url === "string" ? o.url : undefined,
    mode: typeof o.mode === "string" ? o.mode : undefined,
    status: typeof o.status === "number" ? o.status : undefined,
    contentType: typeof o.contentType === "string" ? o.contentType : undefined,
    truncated: typeof o.truncated === "boolean" ? o.truncated : undefined,
    bytes: typeof o.bytes === "number" ? o.bytes : undefined,
  };
}

export function ToolCall({ block }: { block: UiBlockTool }) {
  const [open, setOpen] = useState(false);
  const isError = block.status === "error";
  const isRunning = block.status === "running";
  if (block.name === "ask_user" || block.name === "askUser") {
    return <AskUserToolCall block={block} open={open} setOpen={setOpen} />;
  }
  if (block.name === "todo") {
    return <TodoToolCall block={block} open={open} setOpen={setOpen} />;
  }
  if (block.name === "task") {
    return <TaskToolCall block={block} open={open} setOpen={setOpen} />;
  }
  if (block.name === "fast_fetch") {
    return <FastFetchToolCall block={block} open={open} setOpen={setOpen} />;
  }
  if (isFileMutationTool(block.name)) {
    return <FileMutationToolCall block={block} />;
  }
  return (
    <div
      className={clsx(
        "my-1 rounded-md border text-xs",
        isError
          ? "border-(--color-danger)/30 bg-(--color-danger)/5"
          : "border-(--color-border) bg-(--color-bg-soft)",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-(--color-bg-mute) rounded-md text-left"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {isError ? (
          <AlertCircle size={12} className="text-(--color-danger)" />
        ) : (
          <Wrench size={12} className="text-(--color-fg-mute)" />
        )}
        <span className="font-mono text-(--color-accent)">{block.name}</span>
        <span className="font-mono text-(--color-fg-mute) truncate">
          {shortInput(block.input)}
        </span>
        <span className="ml-auto text-(--color-fg-dim)">
          {isRunning ? "…" : isError ? "ошибка" : ""}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-2 space-y-2">
          {block.input != null && (
            <div>
              <div className="text-(--color-fg-dim) mb-0.5">input</div>
              <pre className="font-mono text-[11px] whitespace-pre-wrap break-all bg-(--color-bg) border border-(--color-border) rounded p-2">
                {pretty(block.input)}
              </pre>
            </div>
          )}
          {block.output != null && block.output !== "" && (
            <div>
              <div className="text-(--color-fg-dim) mb-0.5">output</div>
              <pre className="font-mono text-[11px] whitespace-pre-wrap break-all bg-(--color-bg) border border-(--color-border) rounded p-2 max-h-64 overflow-y-auto">
                {pretty(block.output)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FastFetchToolCall({
  block,
  open,
  setOpen,
}: {
  block: UiBlockTool;
  open: boolean;
  setOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
}) {
  const isError = block.status === "error";
  const isRunning = block.status === "running";
  const input = asRecord(block.input);
  const details = fastFetchDetails(block.details);
  const query = String(input.query ?? details.url ?? "");
  const meta = [
    details.mode,
    details.status != null ? String(details.status) : undefined,
    details.contentType,
    details.bytes != null ? `${details.bytes}b` : undefined,
    details.truncated ? "truncated" : undefined,
  ].filter(Boolean).join(" · ");
  return (
    <div
      className={clsx(
        "my-1 rounded-md border text-xs",
        isError
          ? "border-(--color-danger)/30 bg-(--color-danger)/5"
          : "border-(--color-accent)/20 bg-(--color-accent)/5",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-(--color-bg-mute) rounded-md text-left"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {isError ? (
          <AlertCircle size={12} className="text-(--color-danger)" />
        ) : (
          <Globe size={12} className="text-(--color-accent)" />
        )}
        <span className="font-mono text-(--color-accent)">fast_fetch</span>
        <span className="font-mono text-(--color-fg) truncate min-w-0" title={details.url ?? query}>
          {details.url ?? query}
        </span>
        <span className="ml-auto shrink-0 text-(--color-fg-dim)">
          {isRunning ? "загрузка…" : isError ? "ошибка" : meta}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-2 space-y-2">
          {query && details.url && details.url !== query && (
            <div className="text-[11px] text-(--color-fg-dim)">query: {query}</div>
          )}
          {block.output != null && block.output !== "" && (
            <pre className="font-mono text-[11px] whitespace-pre-wrap break-all bg-(--color-bg) border border-(--color-border) rounded p-2 max-h-80 overflow-y-auto">
              {pretty(block.output)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function FileMutationToolCall({ block }: { block: UiBlockTool }) {
  const [open, setOpen] = useState(true);
  const isError = block.status === "error";
  const isRunning = block.status === "running";
  const preview = fileMutationPreview(block);
  const lines = preview.diff ? preview.diff.split(/\r?\n/) : [];
  return (
    <div
      className={clsx(
        "my-1 rounded-lg border text-xs overflow-hidden",
        isError
          ? "border-(--color-danger)/30 bg-(--color-danger)/5"
          : "border-(--color-border) bg-(--color-bg-soft)",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2.5 py-2 hover:bg-(--color-bg-mute) text-left"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {isError ? (
          <AlertCircle size={12} className="text-(--color-danger)" />
        ) : (
          <FileText size={12} className="text-(--color-accent)" />
        )}
        <span className="font-mono text-(--color-accent)">{block.name}</span>
        <span className="font-mono text-(--color-fg) truncate min-w-0" title={preview.path}>
          {preview.path}
        </span>
        <span className="ml-auto shrink-0 font-mono text-[10px]">
          {preview.added > 0 && <span className="text-(--color-success)">+{preview.added}</span>}
          {preview.added > 0 && preview.removed > 0 && <span className="text-(--color-fg-dim)"> </span>}
          {preview.removed > 0 && <span className="text-(--color-danger)">-{preview.removed}</span>}
          {preview.added === 0 && preview.removed === 0 && (
            <span className="text-(--color-fg-dim)">{isRunning ? "…" : isError ? "ошибка" : "done"}</span>
          )}
        </span>
      </button>
      {open && (
        <div className="border-t border-(--color-border)">
          {lines.length > 0 ? (
            <pre className="max-h-[420px] overflow-auto bg-(--color-bg) py-1 font-mono text-[11px] leading-5">
              {lines.map((line, index) => (
                <div key={index} className={clsx("px-2 whitespace-pre", diffLineClass(line))}>
                  {line || " "}
                </div>
              ))}
            </pre>
          ) : (
            <div className="px-3 py-2 text-(--color-fg-dim)">Нет diff preview</div>
          )}
          {isError && block.output != null && block.output !== "" && (
            <pre className="border-t border-(--color-danger)/20 bg-(--color-danger)/5 p-2 font-mono text-[11px] whitespace-pre-wrap text-(--color-danger)">
              {pretty(block.output)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function AskUserToolCall({
  block,
  open,
  setOpen,
}: {
  block: UiBlockTool;
  open: boolean;
  setOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
}) {
  const isError = block.status === "error";
  const isRunning = block.status === "running";
  const question = askUserQuestion(block.input);
  const options = askUserOptions(block.input);
  return (
    <div
      className={clsx(
        "my-1 rounded-md border text-xs",
        isError
          ? "border-(--color-danger)/30 bg-(--color-danger)/5"
          : "border-(--color-accent)/25 bg-(--color-accent)/5",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-(--color-bg-mute) rounded-md text-left"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {isError ? (
          <AlertCircle size={12} className="text-(--color-danger)" />
        ) : (
          <MessageCircleQuestion size={12} className="text-(--color-accent)" />
        )}
        <span className="font-mono text-(--color-accent)">ask_user</span>
        <span className="text-(--color-fg-mute) truncate">{question}</span>
        <span className="ml-auto text-(--color-fg-dim)">
          {isRunning ? "ждёт ответа" : isError ? "ошибка" : "ответ получен"}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-2 space-y-2">
          <div>
            <div className="text-(--color-fg-dim) mb-0.5">вопрос</div>
            <div className="whitespace-pre-wrap bg-(--color-bg) border border-(--color-border) rounded p-2">
              {question}
            </div>
          </div>
          {options.length > 0 && (
            <div>
              <div className="text-(--color-fg-dim) mb-0.5">варианты</div>
              <div className="space-y-1">
                {options.map((option, idx) => (
                  <div key={`${idx}:${option}`} className="bg-(--color-bg) border border-(--color-border) rounded px-2 py-1">
                    <span className="font-mono text-(--color-fg-dim) mr-1">{idx + 1}.</span>
                    {option}
                  </div>
                ))}
              </div>
            </div>
          )}
          {block.output != null && block.output !== "" && (
            <div>
              <div className="text-(--color-fg-dim) mb-0.5">ответ</div>
              <pre className="font-mono text-[11px] whitespace-pre-wrap break-all bg-(--color-bg) border border-(--color-border) rounded p-2 max-h-64 overflow-y-auto">
                {pretty(block.output)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TodoToolCall({
  block,
  open,
  setOpen,
}: {
  block: UiBlockTool;
  open: boolean;
  setOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
}) {
  const isError = block.status === "error";
  const isRunning = block.status === "running";
  const details = todoDetails(block.details);
  const action = String(asRecord(block.input).action ?? details?.action ?? "list");
  const todos = details?.todos ?? [];
  const done = todos.filter((todo) => todo.done).length;
  const total = todos.length;
  const active = todos.find((todo) => !todo.done);
  return (
    <div
      className={clsx(
        "my-1 rounded-md border text-xs",
        isError || details?.error
          ? "border-(--color-danger)/30 bg-(--color-danger)/5"
          : "border-(--color-border) bg-(--color-bg-soft)",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-(--color-bg-mute) rounded-md text-left"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {isError || details?.error ? (
          <AlertCircle size={12} className="text-(--color-danger)" />
        ) : (
          <Wrench size={12} className="text-(--color-accent)" />
        )}
        <span className="font-mono text-(--color-accent)">todo</span>
        <span className="font-mono text-(--color-fg-mute)">{action}</span>
        {total > 0 && (
          <span className="text-(--color-fg-mute) truncate">
            {done}/{total}
            {active ? ` · ${active.text}` : " · complete"}
          </span>
        )}
        <span className="ml-auto text-(--color-fg-dim)">
          {isRunning ? "…" : isError || details?.error ? "ошибка" : ""}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-2 space-y-2">
          {details?.error && <div className="text-(--color-danger)">Error: {details.error}</div>}
          {todos.length > 0 ? (
            <div className="space-y-1">
              {todos.map((todo) => (
                <div key={todo.id} className="flex items-start gap-2 bg-(--color-bg) border border-(--color-border) rounded px-2 py-1">
                  <span className={todo.done ? "text-(--color-success)" : "text-(--color-fg-dim)"}>
                    {todo.done ? "✓" : "○"}
                  </span>
                  <span className="font-mono text-(--color-fg-dim)">#{todo.id}</span>
                  <span className={todo.done ? "text-(--color-fg-dim) line-through" : "text-(--color-fg-mute)"}>
                    {todo.text}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-(--color-fg-dim)">No todos</div>
          )}
          {block.output != null && block.output !== "" && (
            <pre className="font-mono text-[11px] whitespace-pre-wrap break-all bg-(--color-bg) border border-(--color-border) rounded p-2 max-h-64 overflow-y-auto">
              {pretty(block.output)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function TaskToolCall({
  block,
  open,
  setOpen,
}: {
  block: UiBlockTool;
  open: boolean;
  setOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
}) {
  const isError = block.status === "error";
  const isRunning = block.status === "running";
  const input = asRecord(block.input);
  const details = taskDetails(block.details);
  const description = String(details.description ?? input.description ?? "Sub-agent task");
  const agent = typeof input.agent === "string" ? input.agent : undefined;
  const instructions = typeof input.instructions === "string" ? input.instructions : "";
  return (
    <div
      className={clsx(
        "my-1 rounded-md border text-xs",
        isError
          ? "border-(--color-danger)/30 bg-(--color-danger)/5"
          : isRunning
            ? "border-(--color-accent)/30 bg-(--color-accent)/5"
            : "border-(--color-border) bg-(--color-bg-soft)",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-(--color-bg-mute) rounded-md text-left"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {isError ? (
          <AlertCircle size={12} className="text-(--color-danger)" />
        ) : (
          <Bot size={12} className="text-(--color-accent)" />
        )}
        <span className="font-mono text-(--color-accent)">task</span>
        {agent && <span className="font-mono text-(--color-fg-dim)">{agent}</span>}
        <span className="text-(--color-fg-mute) truncate">{description}</span>
        <span className="ml-auto text-(--color-fg-dim)">
          {isRunning ? "running" : isError ? "ошибка" : "done"}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-2 space-y-2">
          <div>
            <div className="text-(--color-fg-dim) mb-0.5">задача</div>
            <div className="bg-(--color-bg) border border-(--color-border) rounded p-2 whitespace-pre-wrap">
              {description}
            </div>
          </div>
          {instructions && (
            <div>
              <div className="text-(--color-fg-dim) mb-0.5">инструкции</div>
              <pre className="font-mono text-[11px] whitespace-pre-wrap break-all bg-(--color-bg) border border-(--color-border) rounded p-2 max-h-40 overflow-y-auto">
                {instructions}
              </pre>
            </div>
          )}
          {(details.inputTokens != null || details.outputTokens != null || details.savedTokens != null) && (
            <div className="grid grid-cols-3 gap-1">
              <Metric label="input" value={details.inputTokens} />
              <Metric label="output" value={details.outputTokens} />
              <Metric label="saved" value={details.savedTokens} accent />
            </div>
          )}
          {details.cwd && (
            <div className="font-mono text-[10px] text-(--color-fg-dim) truncate" title={details.cwd}>
              cwd: {details.cwd}
            </div>
          )}
          {block.output != null && block.output !== "" && (
            <div>
              <div className="text-(--color-fg-dim) mb-0.5">результат</div>
              <pre className="font-mono text-[11px] whitespace-pre-wrap break-all bg-(--color-bg) border border-(--color-border) rounded p-2 max-h-64 overflow-y-auto">
                {pretty(block.output)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value?: number; accent?: boolean }) {
  return (
    <div className="border border-(--color-border) rounded bg-(--color-bg) px-2 py-1">
      <div className="text-(--color-fg-dim)">{label}</div>
      <div className={clsx("font-mono", accent ? "text-(--color-accent)" : "text-(--color-fg-mute)")}>
        {value == null ? "—" : value.toLocaleString()}
      </div>
    </div>
  );
}
