import { useState } from "react";
import { ChevronDown, ChevronRight, Wrench, AlertCircle, MessageCircleQuestion, Bot, FileText, Globe, Image as ImageIcon, Camera, MousePointer2, Clock } from "lucide-react";
import clsx from "clsx";
import type { UiBlockTool } from "@/store/chat";
import { useExt } from "@/store/ext";
import {
  shortInput,
  pretty,
  isFileMutationTool,
  filePathFromInput,
  editItems,
  buildEditInputDiff,
  buildWriteDiff,
  diffStats,
  diffLineClass,
  textLineCount,
  buildFileMutationPreviewFromInput,
  type EditItem,
} from "@/components/ExtUI/permissionUtils";

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function detailsDiff(details: unknown): string | undefined {
  const record = asRecord(details);
  return typeof record.diff === "string" ? record.diff : undefined;
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


function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function taskDetails(details: unknown): {
  description?: string;
  cwd?: string;
  inputTokens?: number;
  outputTokens?: number;
  savedTokens?: number;
  activities: string[];
} {
  const o = asRecord(details);
  return {
    description: typeof o.description === "string" ? o.description : undefined,
    cwd: typeof o.cwd === "string" ? o.cwd : undefined,
    inputTokens: typeof o.inputTokens === "number" ? o.inputTokens : undefined,
    outputTokens: typeof o.outputTokens === "number" ? o.outputTokens : undefined,
    savedTokens: typeof o.savedTokens === "number" ? o.savedTokens : undefined,
    activities: stringList(o.activities ?? o.recentActivities),
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
  // Pending ask_user — inline card with question, options, and submit
  if (block.status === "pending" && (block.name === "ask_user" || block.name === "askUser")) {
    return <PendingAskUserToolCallBlock block={block} />;
  }
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
  if (block.name === "screenshot") {
    return <ScreenshotToolCall block={block} open={open} setOpen={setOpen} />;
  }
  if (block.name === "interact") {
    return <InteractToolCall block={block} open={open} setOpen={setOpen} />;
  }
  // Pending permission — show compact inline card with approve/deny
  if (block.status === "pending") {
    return <PendingToolCallBlock block={block} />;
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
        <span className="ml-auto flex items-center gap-1.5 text-(--color-fg-dim)">
          {block.images && block.images.length > 0 && (
            <ImageIcon size={10} />
          )}
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
          {block.images && block.images.length > 0 && (
            <ToolImages images={block.images} />
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

function ScreenshotToolCall({
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
  const input = block.input as Record<string, unknown> | undefined;
  const url = typeof input?.url === "string" ? input.url : undefined;
  const mode = url ? "web" : "desktop";
  const hasImages = block.images && block.images.length > 0;

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
          <Camera size={12} className="text-(--color-accent)" />
        )}
        <span className="font-mono text-(--color-accent)">screenshot</span>
        <span className="font-mono text-(--color-fg) truncate min-w-0" title={url ?? mode}>
          {url ?? mode}
        </span>
        <span className="ml-auto shrink-0 text-(--color-fg-dim) flex items-center gap-1.5">
          {hasImages && !open && (
            <span className="flex -space-x-1">
              {block.images!.slice(0, 3).map((img, idx) => (
                <img
                  key={idx}
                  src={`data:${img.mimeType};base64,${img.data}`}
                  alt=""
                  className="w-5 h-5 rounded object-cover border border-(--color-border)"
                />
              ))}
            </span>
          )}
          {isRunning ? "capturing…" : isError ? "ошибка" : hasImages ? "" : "done"}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-2 space-y-2">
          <div className="grid grid-cols-2 gap-2 text-[11px] text-(--color-fg-dim)">
            <div>
              <span className="uppercase">mode</span>: {mode}
            </div>
            {url && (
              <div className="truncate" title={url}>
                <span className="uppercase">url</span>: {url}
              </div>
            )}
          </div>
          {block.output != null && block.output !== "" && (
            <div>
              <div className="text-(--color-fg-dim) mb-0.5">output</div>
              <pre className="font-mono text-[11px] whitespace-pre-wrap break-all bg-(--color-bg) border border-(--color-border) rounded p-2 max-h-64 overflow-y-auto">
                {pretty(block.output)}
              </pre>
            </div>
          )}
          {hasImages && <ToolImages images={block.images} />}
        </div>
      )}
    </div>
  );
}

function InteractToolCall({
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
  const input = block.input as Record<string, unknown> | undefined;
  const action = typeof input?.action === "string" ? input.action : "?";
  const hasScreenshot = input?.screenshot === true;
  const x = typeof input?.x === "number" ? input.x : undefined;
  const y = typeof input?.y === "number" ? input.y : undefined;
  const text = typeof input?.text === "string" ? input.text : undefined;
  const keys = Array.isArray(input?.keys) ? (input.keys as string[]).join(" + ") : undefined;
  const clicks = typeof input?.clicks === "number" ? input.clicks : undefined;

  const detailText =
    action === "click"
      ? x != null && y != null
        ? `(${x}, ${y})`
        : ""
      : action === "type" && text
        ? `"${text.length > 30 ? text.slice(0, 30) + "…" : text}"`
        : action === "key" && keys
          ? keys
          : action === "move" && x != null && y != null
            ? `(${x}, ${y})`
            : action === "scroll"
              ? clicks != null
                ? clicks > 0
                  ? `${clicks} down`
                  : `${Math.abs(clicks)} up`
                : ""
              : "";

  const hasImages = block.images && block.images.length > 0;

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
          <MousePointer2 size={12} className="text-(--color-accent)" />
        )}
        <span className="font-mono text-(--color-accent)">interact</span>
        <span className="font-mono text-(--color-fg-mute)">{action}</span>
        {detailText && (
          <span className="font-mono text-(--color-fg) truncate min-w-0" title={detailText}>
            {detailText}
          </span>
        )}
        <span className="ml-auto shrink-0 text-(--color-fg-dim) flex items-center gap-1.5">
          {hasScreenshot && <Camera size={10} className="text-(--color-accent)" />}
          {hasImages && !open && (
            <span className="flex -space-x-1">
              {block.images!.slice(0, 3).map((img, idx) => (
                <img
                  key={idx}
                  src={`data:${img.mimeType};base64,${img.data}`}
                  alt=""
                  className="w-5 h-5 rounded object-cover border border-(--color-border)"
                />
              ))}
            </span>
          )}
          {isRunning ? "…" : isError ? "ошибка" : ""}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-2 space-y-2">
          <div className="grid grid-cols-2 gap-2 text-[11px] text-(--color-fg-dim)">
            <div>
              <span className="uppercase">action</span>: {action}
            </div>
            {x != null && (
              <div>
                <span className="uppercase">x</span>: {x}
              </div>
            )}
            {y != null && (
              <div>
                <span className="uppercase">y</span>: {y}
              </div>
            )}
            {text && (
              <div className="col-span-2 truncate" title={text}>
                <span className="uppercase">text</span>: {text}
              </div>
            )}
            {keys && (
              <div className="col-span-2 truncate" title={keys}>
                <span className="uppercase">keys</span>: {keys}
              </div>
            )}
            {clicks != null && (
              <div>
                <span className="uppercase">clicks</span>: {clicks > 0 ? `${clicks} down` : `${Math.abs(clicks)} up`}
              </div>
            )}
          </div>
          {block.output != null && block.output !== "" && (
            <div>
              <div className="text-(--color-fg-dim) mb-0.5">output</div>
              <pre className="font-mono text-[11px] whitespace-pre-wrap break-all bg-(--color-bg) border border-(--color-border) rounded p-2 max-h-64 overflow-y-auto">
                {pretty(block.output)}
              </pre>
            </div>
          )}
          {hasImages && <ToolImages images={block.images} />}
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
          {details.activities.length > 0 && (
            <div>
              <div className="text-(--color-fg-dim) mb-0.5">инструменты субагента</div>
              <div className="bg-(--color-bg) border border-(--color-border) rounded p-2 space-y-1">
                {details.activities.map((activity, idx) => (
                  <div key={`${block.toolUseId}-activity-${idx}`} className="font-mono text-[11px] text-(--color-fg-mute) truncate" title={activity}>
                    └─ {activity}
                  </div>
                ))}
              </div>
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

// ============================================================================
// Pending Permission — compact inline card with approve/deny buttons
// ============================================================================

function PendingToolCallBlock({ block }: { block: UiBlockTool }) {
  const resolvePendingPermission = useExt((s) => s.resolvePendingPermission);
  const input = asRecord(block.input);
  const permissionValue = String(input.permissionValue ?? "");
  const permissionType = String(input.permissionType ?? "file");
  const toolName = String(input.permissionToolName ?? block.name);
  const toolArgs = input.permissionToolArgs as Record<string, unknown> | undefined;

  let typeLabel = "Действие";
  if (permissionType === "bash") typeLabel = "Команда";
  else if (permissionType === "file" && isFileMutationTool(toolName)) typeLabel = toolName;
  else if (permissionType === "mcp") typeLabel = toolName;

  const stats = (() => {
    if (permissionType === "file" && toolArgs) {
      return buildFileMutationPreviewFromInput(toolArgs, permissionValue);
    }
    return null;
  })();

  const handleAllowOnce = () => resolvePendingPermission(block.toolUseId, { decision: "allow-once" });
  const handleDenyOnce = () => resolvePendingPermission(block.toolUseId, { decision: "deny-once" });

  return (
    <div className="my-1 rounded-lg border border-(--color-accent)/30 bg-(--color-accent)/5 overflow-hidden">
      <div className="px-3 py-2 flex items-center gap-2">
        <Clock size={14} className="text-(--color-accent) animate-pulse shrink-0" />
        <span className="text-[10px] uppercase tracking-wider font-semibold text-(--color-accent) shrink-0">
          Разрешение
        </span>
        <span className="font-mono text-xs text-(--color-fg-mute)">{typeLabel}</span>
        <span className="font-mono text-xs text-(--color-fg) truncate min-w-0" title={permissionValue}>
          {permissionValue}
        </span>
        {stats && (stats.added > 0 || stats.removed > 0) && (
          <span className="font-mono text-[10px] shrink-0">
            {stats.added > 0 && <span className="text-(--color-success)">+{stats.added}</span>}
            {stats.added > 0 && stats.removed > 0 && <span className="text-(--color-fg-dim)"> </span>}
            {stats.removed > 0 && <span className="text-(--color-danger)">-{stats.removed}</span>}
          </span>
        )}
        <span className="flex-1" />
        <button
          type="button"
          onClick={handleDenyOnce}
          className="text-[11px] px-2 py-1 rounded border border-(--color-border) text-(--color-fg-mute) hover:bg-(--color-bg-mute) hover:text-(--color-fg) transition-colors shrink-0"
        >
          Deny once
        </button>
        <button
          type="button"
          onClick={handleAllowOnce}
          className="text-[11px] px-2 py-1 rounded bg-(--color-accent) text-white hover:brightness-110 transition-all shrink-0"
        >
          Allow once
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Pending Ask User — inline card with question, options, and submit/cancel
// ============================================================================

function PendingAskUserToolCallBlock({ block }: { block: UiBlockTool }) {
  const resolvePendingAskUser = useExt((s) => s.resolvePendingAskUser);
  const input = asRecord(block.input);
  const question = String(input.question ?? "What would you like to do?");
  const options = Array.isArray(input.options)
    ? (input.options as unknown[]).filter((o): o is string => typeof o === "string")
    : [];
  const allowMultiple = input.allowMultiple === true;

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [custom, setCustom] = useState("");

  const toggle = (idx: number) => {
    setSelected((cur) => {
      const next = new Set(allowMultiple ? cur : []);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const submit = () => {
    const parts = [...selected]
      .sort((a, b) => a - b)
      .map((idx) => options[idx])
      .filter((v): v is string => typeof v === "string" && v.length > 0);
    const customText = custom.trim();
    if (customText) parts.push(customText);
    resolvePendingAskUser(block.toolUseId, { value: parts.join(", ") || "(no selection)" });
  };

  const cancel = () => {
    resolvePendingAskUser(block.toolUseId, { cancelled: true });
  };

  return (
    <div className="my-1 rounded-lg border border-(--color-accent)/30 bg-(--color-accent)/5 overflow-hidden">
      <div className="px-3 py-2 flex items-start gap-2">
        <MessageCircleQuestion size={14} className="text-(--color-accent) shrink-0 mt-0.5" />
        <span className="text-[10px] uppercase tracking-wider font-semibold text-(--color-accent) shrink-0 mt-0.5">
          Вопрос
        </span>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="text-xs text-(--color-fg) whitespace-pre-wrap">{question}</div>
          {options.length > 0 && (
            <div className="space-y-1">
              {options.map((option, idx) => {
                const isSelected = selected.has(idx);
                return (
                  <button
                    key={`${idx}:${option}`}
                    type="button"
                    onClick={() => toggle(idx)}
                    className={
                      "w-full text-left px-2 py-1 rounded border text-xs transition-colors " +
                      (isSelected
                        ? "border-(--color-accent)/50 bg-(--color-accent-soft) text-(--color-accent)"
                        : "border-(--color-border) hover:bg-(--color-bg-mute)")
                    }
                  >
                    <span className="font-mono mr-1.5">
                      {allowMultiple ? (isSelected ? "[x]" : "[ ]") : isSelected ? "(•)" : "( )"}
                    </span>
                    {option}
                  </button>
                );
              })}
            </div>
          )}
          <textarea
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Свой ответ…"
            className="w-full text-xs bg-(--color-bg) border border-(--color-border) rounded px-2 py-1 min-h-[28px] resize-none"
            rows={1}
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={cancel}
              className="text-[11px] px-2 py-1 rounded border border-(--color-border) text-(--color-fg-mute) hover:bg-(--color-bg-mute) hover:text-(--color-fg) transition-colors shrink-0"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={submit}
              className="text-[11px] px-2 py-1 rounded bg-(--color-accent) text-white hover:brightness-110 transition-all shrink-0"
            >
              Ответить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolImages({ images }: { images: UiBlockTool["images"] }) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  if (!images || images.length === 0) return null;
  return (
    <div className="space-y-1">
      <div className="text-(--color-fg-dim) mb-0.5">
        <ImageIcon size={11} className="inline mr-1" />
        screenshot {images.length > 1 ? `(${images.length})` : ""}
      </div>
      <div className="flex flex-wrap gap-2">
        {images.map((img, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
            className="group relative"
          >
            <img
              src={`data:${img.mimeType};base64,${img.data}`}
              alt=""
              className={`
                rounded-md border border-(--color-border) object-cover
                ${expandedIdx === idx ? "max-h-96 w-auto" : "max-h-32 w-auto"}
                transition-all duration-200
              `}
            />
            <div className="absolute inset-0 rounded-md ring-1 ring-inset ring-(--color-accent)/0 group-hover:ring-(--color-accent)/30 transition-all" />
          </button>
        ))}
      </div>
    </div>
  );
}
