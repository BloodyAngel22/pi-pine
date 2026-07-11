import { useState, useEffect, useMemo, memo } from "react";
import { ChevronDown, ChevronRight, Wrench, AlertCircle, MessageCircleQuestion, Bot, FileText, Globe, Image as ImageIcon, Camera, MousePointer2, Clock, Search, Copy, Check, Layers, X, Cloud } from "@/components/ui/icons/compat";
import clsx from "clsx";
import type { UiBlockTool } from "@/store/chat";
import { useChat } from "@/store/chat";
import { useExt } from "@/store/ext";
import { ActivityIndicator } from "./ActivityIndicator";
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
  buildFileMutationPreviewFromFile,
  toRelativePath,
  type DiffPreview,
  type EditItem,
} from "@/components/ExtUI/permissionUtils";

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function detailsDiff(details: unknown): string | undefined {
  const record = asRecord(details);
  return typeof record.diff === "string" ? record.diff : undefined;
}

function fileMutationPreview(
  block: UiBlockTool,
  fileContent?: string,
): {
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
  // Приоритет: 1) details.diff от бэкенда (с номерами строк), 2) fileContent для абсолютных номеров, 3) fallback
  const diff =
    detailsDiff(block.details) ??
    (fileContent ? buildEditInputDiff(edits, fileContent) : buildEditInputDiff(edits));
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

function formatSeconds(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const seconds = Math.max(0, Math.round(value));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`;
}

interface SubagentToolCallEntryInfo {
  toolCallId: string;
  toolName: string;
  args?: Record<string, unknown>;
  status: "running" | "done" | "error";
  output?: string;
  startedAt: number;
  completedAt?: number;
}

function toolCallEntryList(value: unknown): SubagentToolCallEntryInfo[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => asRecord(v))
    .filter((o) => typeof o.toolCallId === "string" && typeof o.toolName === "string")
    .map((o) => ({
      toolCallId: o.toolCallId as string,
      toolName: o.toolName as string,
      args: typeof o.args === "object" && o.args !== null ? (o.args as Record<string, unknown>) : undefined,
      status: (o.status === "done" || o.status === "error" ? o.status : "running") as "running" | "done" | "error",
      output: typeof o.output === "string" ? o.output : undefined,
      startedAt: typeof o.startedAt === "number" ? o.startedAt : Date.now(),
      completedAt: typeof o.completedAt === "number" ? o.completedAt : undefined,
    }));
}

function taskDetails(details: unknown): {
  taskId?: string;
  rawStatus?: string;
  description?: string;
  cwd?: string;
  inputTokens?: number;
  outputTokens?: number;
  savedTokens?: number;
  activities: string[];
  toolCalls: SubagentToolCallEntryInfo[];
  queuedAt?: number;
  timedOut?: boolean;
  interrupted?: boolean;
} {
  const o = asRecord(details);
  return {
    taskId: typeof o.taskId === "string" ? o.taskId : undefined,
    rawStatus: typeof o.status === "string" ? o.status : undefined,
    description: typeof o.description === "string" ? o.description : undefined,
    cwd: typeof o.cwd === "string" ? o.cwd : undefined,
    inputTokens: typeof o.inputTokens === "number" ? o.inputTokens : undefined,
    outputTokens: typeof o.outputTokens === "number" ? o.outputTokens : undefined,
    savedTokens: typeof o.savedTokens === "number" ? o.savedTokens : undefined,
    activities: stringList(o.activities ?? o.recentActivities),
    toolCalls: toolCallEntryList(o.toolCalls),
    queuedAt: typeof o.queuedAt === "number" ? o.queuedAt : undefined,
    timedOut: typeof o.timedOut === "boolean" ? o.timedOut : undefined,
    interrupted: typeof o.interrupted === "boolean" ? o.interrupted : undefined,
  };
}

export type SubagentStatus = "queued" | "running" | "done" | "error" | "timeout" | "partial";

export function getSubagentStatus(block: UiBlockTool): SubagentStatus {
  if (block.status === "error") return "error";
  if (block.status === "running" || block.status === "pending") {
    const details = taskDetails(block.details);
    if (details.rawStatus === "queued") return "queued";
    return "running";
  }
  const details = taskDetails(block.details);
  if (details.timedOut) return "timeout";
  if (details.interrupted) return "partial";
  return "done";
}

const SUBAGENT_STATUS_LABEL: Record<SubagentStatus, string> = {
  queued: "в очереди",
  running: "выполняется",
  done: "готово",
  error: "ошибка",
  timeout: "таймаут — частичный результат",
  partial: "прервано — частичный результат",
};

export function subagentStatusLabel(status: SubagentStatus): string {
  return SUBAGENT_STATUS_LABEL[status];
}

/** Живой таймер длительности: тикает раз в секунду, пока status === running. */
export function useElapsedLabel(
  startedAt: number | undefined,
  completedAt: number | undefined,
  running: boolean,
): string | undefined {
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!running || startedAt == null) return;
    const timer = window.setInterval(() => forceTick((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, [running, startedAt]);
  if (startedAt == null) return undefined;
  const end = completedAt ?? (running ? Date.now() : undefined);
  if (end == null) return undefined;
  return formatSeconds((end - startedAt) / 1000);
}

function webSearchDetails(details: unknown): {
  url?: string;
  mode?: string;
  status?: number;
  contentType?: string;
  truncated?: boolean;
  bytes?: number;
  blocked?: boolean;
  challengeType?: string;
  headlessUsed?: boolean;
} {
  const o = asRecord(details);
  return {
    url: typeof o.url === "string" ? o.url : undefined,
    mode: typeof o.mode === "string" ? o.mode : undefined,
    status: typeof o.status === "number" ? o.status : undefined,
    contentType: typeof o.contentType === "string" ? o.contentType : undefined,
    truncated: typeof o.truncated === "boolean" ? o.truncated : undefined,
    bytes: typeof o.bytes === "number" ? o.bytes : undefined,
    blocked: typeof o.blocked === "boolean" ? o.blocked : undefined,
    challengeType: typeof o.challengeType === "string" ? o.challengeType : undefined,
    headlessUsed: typeof o.headlessUsed === "boolean" ? o.headlessUsed : undefined,
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
  // Pending permission (bash/file/mcp) — show compact inline card with approve/deny.
  // Must be checked before the tool-name-specific renderers below: those expect a
  // running/done tool call shape and would otherwise swallow the approval UI for
  // tools like web_search/task/deep_research that also have dedicated renderers.
  if (block.status === "pending") {
    return <PendingToolCallBlock block={block} />;
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
  if (block.name === "deep_research") {
    return <DeepResearchToolCall block={block} open={open} setOpen={setOpen} />;
  }
  if (block.name === "web_search") {
    return <WebSearchToolCall block={block} open={open} setOpen={setOpen} />;
  }
  if (block.name === "fast_context") {
    return <FastContextToolCall block={block} open={open} setOpen={setOpen} />;
  }
  if (block.name === "screenshot") {
    return <ScreenshotToolCall block={block} open={open} setOpen={setOpen} />;
  }
  if (block.name === "interact") {
    return <InteractToolCall block={block} open={open} setOpen={setOpen} />;
  }
  if (block.name === "analyze_image") {
    return <AnalyzeImageToolCall block={block} open={open} setOpen={setOpen} />;
  }
  if (isFileMutationTool(block.name)) {
    return <FileMutationToolCall block={block} />;
  }
  return (
    <div
      className={clsx(
        "pi-chat-scaled my-1 rounded-md border text-xs",
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
          {isRunning ? (
            <ActivityIndicator tone="tool" size="sm" label={`${block.name} выполняется`} />
          ) : isError ? "ошибка" : ""}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-2 space-y-2">
          {block.input != null && (
            <div>
              <div className="text-(--color-fg-dim) mb-0.5">input</div>
              <pre className="font-mono text-[11px] whitespace-pre-wrap bg-(--color-bg) border border-(--color-border) rounded p-2">
                {pretty(block.input)}
              </pre>
            </div>
          )}
          {block.output != null && block.output !== "" && (
            <div>
              <div className="text-(--color-fg-dim) mb-0.5">output</div>
              <pre className="font-mono text-[11px] whitespace-pre-wrap bg-(--color-bg) border border-(--color-border) rounded p-2 max-h-64 overflow-y-auto">
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

function DeepResearchToolCall({
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
  const details = asRecord(block.details);
  const question = String(input.question ?? details.question ?? "Deep research");
  const iteration = typeof details.iteration === "number" ? details.iteration : typeof details.iterationCount === "number" ? details.iterationCount : 0;
  const maxIterations = typeof details.maxIterations === "number" ? details.maxIterations : typeof input.depth === "number" ? input.depth : undefined;
  const confidence = typeof details.confidence === "number" ? details.confidence : undefined;
  const sourcesCount = typeof details.sourcesCount === "number" ? details.sourcesCount : typeof details.sourceCount === "number" ? details.sourceCount : undefined;
  const phase = typeof details.currentPhase === "string" ? details.currentPhase : isRunning ? "running" : "done";
  const currentQuery = typeof details.currentQuery === "string" ? details.currentQuery : undefined;
  const currentStep = typeof details.currentStep === "string" ? details.currentStep : undefined;
  const mode = typeof details.mode === "string" ? details.mode : typeof input.mode === "string" ? input.mode : undefined;
  const elapsed = formatSeconds(details.elapsedSeconds);
  const remaining = formatSeconds(details.remainingSeconds);
  const budget = typeof details.timeBudgetMinutes === "number" ? `${details.timeBudgetMinutes}m` : undefined;
  const stoppedReason = typeof details.stoppedReason === "string" ? details.stoppedReason : undefined;
  const totalQueries = typeof details.totalQueries === "number" ? details.totalQueries : undefined;
  const gaps = stringList(details.gaps);
  const progress = maxIterations && maxIterations > 0 ? Math.min(100, Math.round((iteration / maxIterations) * 100)) : undefined;
  return (
    <div
      className={clsx(
        "pi-chat-scaled my-1 rounded-md border text-xs",
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
          <Search size={12} className="text-(--color-accent)" />
        )}
        <span className="font-mono text-(--color-accent)">deep_research</span>
        <span className="text-(--color-fg) truncate min-w-0" title={question}>{question}</span>
        <span className="ml-auto shrink-0 text-(--color-fg-dim)">
          {isRunning ? (
            <ActivityIndicator
              tone="research"
              size="sm"
              label={`${phase}${remaining ? ` · ${remaining} left` : ""}`}
              showLabel
            />
          ) : isError ? "ошибка" : confidence != null ? `${Math.round(confidence * 100)}%` : "готово"}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-2 space-y-2">
          {progress != null && (
            <div>
              <div className="flex justify-between text-[11px] text-(--color-fg-dim) mb-1">
                <span>iteration {iteration}/{maxIterations}</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 rounded bg-(--color-bg-mute) overflow-hidden">
                <div className="h-full bg-(--color-accent)" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2 text-[11px] text-(--color-fg-dim)">
            <span>phase: {phase}</span>
            {currentStep && <span>step: {currentStep}</span>}
            {mode && <span>mode: {mode}</span>}
            {confidence != null && <span>confidence: {Math.round(confidence * 100)}%</span>}
            {sourcesCount != null && <span>sources: {sourcesCount}</span>}
            {totalQueries != null && <span>queries: {totalQueries}</span>}
            {elapsed && <span>elapsed: {elapsed}</span>}
            {remaining && <span>left: {remaining}</span>}
            {budget && <span>budget: {budget}</span>}
            {stoppedReason && <span>stopped: {stoppedReason}</span>}
          </div>
          {currentQuery && (
            <div className="text-[11px] text-(--color-fg-dim) truncate" title={currentQuery}>
              current query: {currentQuery}
            </div>
          )}
          {gaps.length > 0 && (
            <div className="text-[11px] text-(--color-fg-dim)">
              gaps: {gaps.join(", ")}
            </div>
          )}
          {block.output != null && block.output !== "" && (
            <pre className="font-mono text-[11px] whitespace-pre-wrap bg-(--color-bg) border border-(--color-border) rounded p-2 max-h-80 overflow-y-auto">
              {pretty(block.output)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function WebSearchToolCall({
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
  const details = webSearchDetails(block.details);
  const query = String(input.query ?? details.url ?? "");
  const meta = [
    details.mode,
    details.status != null ? String(details.status) : undefined,
    details.contentType,
    details.bytes != null ? `${details.bytes}b` : undefined,
    details.truncated ? "truncated" : undefined,
    details.blocked ? `заблокировано${details.challengeType ? ` (${details.challengeType})` : ""}` : undefined,
    details.headlessUsed ? "headless" : undefined,
  ].filter(Boolean).join(" · ");
  return (
    <div
      className={clsx(
        "pi-chat-scaled my-1 rounded-md border text-xs",
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
        <span className="font-mono text-(--color-accent)">web_search</span>
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
            <pre className="font-mono text-[11px] whitespace-pre-wrap bg-(--color-bg) border border-(--color-border) rounded p-2 max-h-80 overflow-y-auto">
              {pretty(block.output)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function FastContextToolCall({
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
  const query = String(input.query ?? "");
  const details = asRecord(block.details);
  const files = Array.isArray(details.files) ? details.files : [];
  const fileCount = files.length;
  const meta = isRunning ? "поиск…" : isError ? "ошибка" : fileCount > 0 ? `${fileCount} файлов` : "готово";

  return (
    <div
      className={clsx(
        "pi-chat-scaled my-1 rounded-md border text-xs",
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
          <Search size={12} className="text-(--color-accent)" />
        )}
        <span className="font-mono text-(--color-accent)">fast_context</span>
        <span className="font-mono text-(--color-fg) truncate min-w-0" title={query}>
          {query || "<query>"}
        </span>
        <span className="ml-auto shrink-0 text-(--color-fg-dim)">
          {meta}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-2 space-y-2">
          {files.length > 0 ? (
            <div className="space-y-1">
              {files.map((f: { path?: string; ranges?: string[]; score?: number }) => (
                <div
                  key={f.path ?? ""}
                  className="flex items-start gap-1.5 text-xs text-(--color-fg-mute)"
                >
                  <FileText size={11} className="mt-0.5 shrink-0 text-(--color-accent)" />
                  <div className="min-w-0">
                    <div className="truncate font-mono">{f.path}</div>
                    {f.ranges && f.ranges.length > 0 && (
                      <div className="text-[10px] text-(--color-fg-dim)">
                        {f.ranges.join(", ")}
                      </div>
                    )}
                    {f.score != null && (
                      <div className="text-[10px] text-(--color-fg-dim)">
                        score: {f.score}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-(--color-fg-dim)">Нет результатов</div>
          )}
          {block.output != null && block.output !== "" && (
            <pre className="font-mono text-[11px] whitespace-pre-wrap bg-(--color-bg) border border-(--color-border) rounded p-2 max-h-80 overflow-y-auto">
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
        "pi-chat-scaled my-1 rounded-md border text-xs",
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
              {block.images!.filter((img) => !img.dropped).slice(0, 3).map((img, idx) => (
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
              <pre className="font-mono text-[11px] whitespace-pre-wrap bg-(--color-bg) border border-(--color-border) rounded p-2 max-h-64 overflow-y-auto">
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
        "pi-chat-scaled my-1 rounded-md border text-xs",
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
              {block.images!.filter((img) => !img.dropped).slice(0, 3).map((img, idx) => (
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
              <pre className="font-mono text-[11px] whitespace-pre-wrap bg-(--color-bg) border border-(--color-border) rounded p-2 max-h-64 overflow-y-auto">
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

function CopyPathButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  const cwd = useChat((s) => s.cwd);
  const relativePath = toRelativePath(path, cwd);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(relativePath);
    } catch {
      // ignore
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={`Копировать относительный путь: ${relativePath}`}
      className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded text-(--color-fg-dim) hover:text-(--color-accent) hover:bg-(--color-bg-mute) transition-colors"
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
    </button>
  );
}

const FileMutationToolCall = memo(function FileMutationToolCall({ block }: { block: UiBlockTool }) {
  const [open, setOpen] = useState(true);
  const [fileContent, setFileContent] = useState<string | undefined>(undefined);
  const isError = block.status === "error";
  const isRunning = block.status === "running";
  const backendDiff = detailsDiff(block.details);

  // Load file content for absolute line numbers (async).
  // Guarded by `fileContent != null` so a later, unrelated `block.details`
  // patch (status/output merge — see mergeToolDetails, always a new object
  // reference) doesn't re-trigger a fresh disk read of a file we already have.
  useEffect(() => {
    if (backendDiff != null || fileContent != null) return;
    const input = asRecord(block.input);
    const path = filePathFromInput(input);
    if (!path || path === "unknown file") return;
    let cancelled = false;
    import("@tauri-apps/plugin-fs")
      .then((mod) => mod.readTextFile(path))
      .then((content) => {
        if (!cancelled) setFileContent(content);
      })
      .catch(() => {
        // Ignore: fall back to buildEditInputDiff without file content
      });
    return () => { cancelled = true; };
  }, [backendDiff, fileContent, block.input]);

  // jsdiff's diffLines is not cheap for large files — memoize so it only
  // reruns when the actual inputs change, not on every re-render caused by
  // a sibling tool call updating within the same assistant message.
  const preview = useMemo(
    () => fileMutationPreview(block, fileContent),
    [block.name, block.input, backendDiff, fileContent],
  );
  const lines = preview.diff ? preview.diff.split(/\r?\n/) : [];
  return (
    <div
      className={clsx(
        "pi-chat-scaled my-1 rounded-lg border text-xs overflow-hidden",
        isError
          ? "border-(--color-danger)/30 bg-(--color-danger)/5"
          : "border-(--color-border) bg-(--color-bg-soft)",
      )}
    >
      <div className="w-full flex items-center gap-2 px-2.5 py-2 hover:bg-(--color-bg-mute)">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 min-w-0 flex-1 text-left"
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {isError ? (
            <AlertCircle size={12} className="text-(--color-danger)" />
          ) : (
            <FileText size={12} className="text-(--color-accent)" />
          )}
          <span className="font-mono text-(--color-accent) shrink-0">{block.name}</span>
          <span className="font-mono text-(--color-fg) truncate min-w-0" title={preview.path}>
            {preview.path}
          </span>
        </button>
        {preview.path !== "unknown file" && <CopyPathButton path={preview.path} />}
        <span className="ml-auto shrink-0 font-mono text-[10px]">
          {preview.added > 0 && <span className="text-(--color-success)">+{preview.added}</span>}
          {preview.added > 0 && preview.removed > 0 && <span className="text-(--color-fg-dim)"> </span>}
          {preview.removed > 0 && <span className="text-(--color-danger)">-{preview.removed}</span>}
          {preview.added === 0 && preview.removed === 0 && (
            <span className="text-(--color-fg-dim)">{isRunning ? "…" : isError ? "ошибка" : "done"}</span>
          )}
        </span>
      </div>
      {open && (
        <div className="border-t border-(--color-border)">
          {lines.length > 0 ? (
            <pre className="max-h-[300px] overflow-auto bg-(--color-bg) py-2 font-mono text-[11px] leading-5" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'normal' }}>
              {lines.map((line, index) => (
                <div key={index} className={clsx("px-3 whitespace-pre-wrap", diffLineClass(line))}>
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
});

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
        "pi-chat-scaled my-1 rounded-md border text-xs",
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
              <pre className="font-mono text-[11px] whitespace-pre-wrap bg-(--color-bg) border border-(--color-border) rounded p-2 max-h-64 overflow-y-auto">
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
        "pi-chat-scaled my-1 rounded-md border text-xs",
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
            <pre className="font-mono text-[11px] whitespace-pre-wrap bg-(--color-bg) border border-(--color-border) rounded p-2 max-h-64 overflow-y-auto">
              {pretty(block.output)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export function SubagentStatusIcon({ status, size = 12 }: { status: SubagentStatus; size?: number }) {
  switch (status) {
    case "error":
      return <AlertCircle size={size} className="text-(--color-danger)" />;
    case "timeout":
      return <Clock size={size} className="text-(--color-warn)" />;
    case "partial":
      return <AlertCircle size={size} className="text-(--color-warn)" />;
    case "queued":
      return <Clock size={size} className="text-(--color-fg-dim)" />;
    case "running":
      return <Bot size={size} className="text-(--color-accent)" />;
    default:
      return <Check size={size} className="text-(--color-fg-mute)" />;
  }
}

function SubagentStatusBadge({ status, elapsed }: { status: SubagentStatus; elapsed?: string }) {
  if (status === "running") {
    return (
      <ActivityIndicator
        tone="subagent"
        size="sm"
        label={elapsed ? `sub-agent running · ${elapsed}` : "sub-agent running"}
        showLabel
      />
    );
  }
  const tone =
    status === "error"
      ? "text-(--color-danger)"
      : status === "timeout" || status === "partial"
        ? "text-(--color-warn)"
        : "text-(--color-fg-dim)";
  return (
    <span className={clsx("font-mono text-[10px]", tone)}>
      {subagentStatusLabel(status)}
      {elapsed ? ` · ${elapsed}` : ""}
    </span>
  );
}

function SubagentTaskActions({ block, status }: { block: UiBlockTool; status: SubagentStatus }) {
  const cancelTask = useChat((s) => s.cancelTask);
  const backgroundTask = useChat((s) => s.backgroundTask);
  const details = taskDetails(block.details);
  if (!details.taskId) return null;
  if (status !== "running" && status !== "queued") return null;
  return (
    <span className="flex items-center gap-1 shrink-0">
      {status === "running" && (
        <button
          type="button"
          title="Перевести в фон"
          onClick={(e) => {
            e.stopPropagation();
            backgroundTask(details.taskId!);
          }}
          className="p-0.5 rounded hover:bg-(--color-bg-hover) text-(--color-fg-dim) hover:text-(--color-fg)"
        >
          <Cloud size={12} />
        </button>
      )}
      <button
        type="button"
        title="Отменить задачу"
        onClick={(e) => {
          e.stopPropagation();
          cancelTask(details.taskId!);
        }}
        className="p-0.5 rounded hover:bg-(--color-bg-hover) text-(--color-fg-dim) hover:text-(--color-danger)"
      >
        <X size={12} />
      </button>
    </span>
  );
}

function SubagentToolCallRow({ entry }: { entry: SubagentToolCallEntryInfo }) {
  const [open, setOpen] = useState(false);
  const icon =
    entry.status === "error" ? (
      <AlertCircle size={11} className="text-(--color-danger)" />
    ) : entry.status === "running" ? (
      <Clock size={11} className="text-(--color-accent) animate-pulse" />
    ) : (
      <Check size={11} className="text-(--color-fg-mute)" />
    );
  const argsPreview = entry.args ? shortInput(entry.args) : undefined;
  return (
    <div className="font-mono text-[11px]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 w-full text-left text-(--color-fg-mute) hover:text-(--color-fg)"
      >
        {icon}
        <span className="truncate">
          {entry.toolName}
          {argsPreview ? `: ${argsPreview}` : ""}
        </span>
      </button>
      {open && entry.output && (
        <pre className="mt-1 ml-4 whitespace-pre-wrap text-(--color-fg-dim) max-h-40 overflow-y-auto">{entry.output}</pre>
      )}
    </div>
  );
}

function TaskDetailBody({ block, details, instructions }: { block: UiBlockTool; details: ReturnType<typeof taskDetails>; instructions?: string }) {
  return (
    <div className="px-3 pb-2 space-y-2">
      {details.description && (
        <div>
          <div className="text-(--color-fg-dim) mb-0.5">задача</div>
          <div className="bg-(--color-bg) border border-(--color-border) rounded p-2 whitespace-pre-wrap">
            {details.description}
          </div>
        </div>
      )}
      {instructions && (
        <div>
          <div className="text-(--color-fg-dim) mb-0.5">инструкции</div>
          <pre className="font-mono text-[11px] whitespace-pre-wrap bg-(--color-bg) border border-(--color-border) rounded p-2 max-h-40 overflow-y-auto">
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
      {details.toolCalls.length > 0 ? (
        <div>
          <div className="text-(--color-fg-dim) mb-0.5">инструменты субагента</div>
          <div className="bg-(--color-bg) border border-(--color-border) rounded p-2 space-y-1.5 max-h-64 overflow-y-auto">
            {details.toolCalls.map((entry) => (
              <SubagentToolCallRow key={entry.toolCallId} entry={entry} />
            ))}
          </div>
        </div>
      ) : (
        details.activities.length > 0 && (
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
        )
      )}
      {details.cwd && (
        <div className="font-mono text-[10px] text-(--color-fg-dim) truncate" title={details.cwd}>
          cwd: {details.cwd}
        </div>
      )}
      {block.output != null && block.output !== "" && (
        <div>
          <div className="text-(--color-fg-dim) mb-0.5">результат</div>
          <pre className="font-mono text-[11px] whitespace-pre-wrap bg-(--color-bg) border border-(--color-border) rounded p-2 max-h-64 overflow-y-auto">
            {pretty(block.output)}
          </pre>
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
  const status = getSubagentStatus(block);
  const input = asRecord(block.input);
  const details = taskDetails(block.details);
  const description = String(details.description ?? input.description ?? "Sub-agent task");
  const agent = typeof input.agent === "string" ? input.agent : undefined;
  const instructions = typeof input.instructions === "string" ? input.instructions : "";
  const elapsed = useElapsedLabel(block.startedAt, block.completedAt, status === "running");
  return (
    <div
      className={clsx(
        "pi-chat-scaled my-1 rounded-md border text-xs",
        status === "error"
          ? "border-(--color-danger)/30 bg-(--color-danger)/5"
          : status === "timeout" || status === "partial"
            ? "border-(--color-warn)/30 bg-(--color-warn)/5"
            : status === "running"
              ? "border-(--color-accent)/30 bg-(--color-accent)/5"
              : status === "queued"
                ? "border-(--color-fg-dim)/30 bg-(--color-bg-soft)"
                : "border-(--color-border) bg-(--color-bg-soft)",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-(--color-bg-mute) rounded-md text-left"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <SubagentStatusIcon status={status} />
        <span className="font-mono text-(--color-accent)">task</span>
        {agent && <span className="font-mono text-(--color-fg-dim)">{agent}</span>}
        <span className="text-(--color-fg-mute) truncate">{description}</span>
        <span className="ml-auto shrink-0 flex items-center gap-1.5 text-(--color-fg-dim)">
          <SubagentTaskActions block={block} status={status} />
          <SubagentStatusBadge status={status} elapsed={elapsed} />
        </span>
      </button>
      {open && <TaskDetailBody block={block} details={{ ...details, description }} instructions={instructions} />}
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

function SubagentSwarmCard({ block }: { block: UiBlockTool }) {
  const [isOpen, setOpen] = useState(false);
  const status = getSubagentStatus(block);
  const details = taskDetails(block.details);
  const input = asRecord(block.input);
  const description = String(details.description ?? input.description ?? "Sub-agent task");
  const agent = typeof input.agent === "string" ? input.agent : undefined;
  const instructions = typeof input.instructions === "string" ? input.instructions : "";
  const elapsed = useElapsedLabel(block.startedAt, block.completedAt, status === "running");
  return (
    <div
      className={clsx(
        "rounded border text-[11px]",
        status === "error"
          ? "border-(--color-danger)/30 bg-(--color-danger)/5"
          : status === "timeout" || status === "partial"
            ? "border-(--color-warn)/30 bg-(--color-warn)/5"
            : status === "running"
              ? "border-(--color-accent)/30 bg-(--color-bg)"
              : status === "queued"
                ? "border-(--color-fg-dim)/30 bg-(--color-bg)"
                : "border-(--color-border) bg-(--color-bg)",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex flex-col items-start gap-1 px-2 py-1.5 text-left hover:bg-(--color-bg-mute) rounded"
      >
        <div className="flex items-center gap-1.5 w-full min-w-0">
          <SubagentStatusIcon status={status} size={11} />
          {agent && <span className="font-mono text-(--color-fg-dim) shrink-0">{agent}</span>}
          <span className="truncate text-(--color-fg-mute)" title={description}>{description}</span>
        </div>
        <div className="flex items-center gap-2 w-full text-(--color-fg-dim)">
          <SubagentStatusBadge status={status} elapsed={elapsed} />
          {details.savedTokens != null && (
            <span className="ml-auto font-mono text-(--color-accent)">-{details.savedTokens.toLocaleString()}tok</span>
          )}
          <SubagentTaskActions block={block} status={status} />
        </div>
      </button>
      {isOpen && <TaskDetailBody block={block} details={{ ...details, description }} instructions={instructions} />}
    </div>
  );
}

export function SubagentSwarm({ blocks }: { blocks: UiBlockTool[] }) {
  const running = blocks.filter((b) => getSubagentStatus(b) === "running").length;
  const gridCols = blocks.length >= 3 ? "grid-cols-3" : "grid-cols-2";
  return (
    <div className="pi-chat-scaled my-1 rounded-md border border-(--color-accent)/20 bg-(--color-accent)/5 text-xs">
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <Layers size={12} className="text-(--color-accent)" />
        <span className="font-mono text-(--color-accent)">{blocks.length} sub-agents</span>
        <span className="text-(--color-fg-dim)">параллельно</span>
        {running > 0 && (
          <span className="ml-auto font-mono text-[10px] text-(--color-accent)">{running}/{blocks.length} running</span>
        )}
      </div>
      <div className={clsx("grid gap-1.5 px-2.5 pb-2", gridCols)}>
        {blocks.map((block) => (
          <SubagentSwarmCard key={block.toolUseId} block={block} />
        ))}
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

  // Async load: read file to compute absolute line numbers
  const [preview, setPreview] = useState<DiffPreview | null>(null);
  const [loading, setLoading] = useState(false);

  let typeLabel = "Действие";
  if (permissionType === "bash") typeLabel = "Команда";
  else if (permissionType === "file" && isFileMutationTool(toolName)) typeLabel = toolName;
  else if (permissionType === "mcp") typeLabel = toolName;

  useEffect(() => {
    if (permissionType === "file" && toolArgs) {
      setLoading(true);
      buildFileMutationPreviewFromFile(toolArgs, permissionValue)
        .then((result) => setPreview(result))
        .catch(() => setPreview(buildFileMutationPreviewFromInput(toolArgs, permissionValue)))
        .finally(() => setLoading(false));
    }
  }, [permissionType, permissionValue, toolArgs]);

  const stats = preview;
  const diffLines = preview?.diff ? preview.diff.split(/\r?\n/) : [];
  const [diffOpen, setDiffOpen] = useState(true);

  const handleAllowOnce = () => resolvePendingPermission(block.toolUseId, { decision: "allow-once" });
  const handleDenyOnce = () => resolvePendingPermission(block.toolUseId, { decision: "deny-once" });

  return (
    <div className="pi-chat-scaled my-1 rounded-lg border border-(--color-accent)/30 bg-(--color-accent)/5 overflow-hidden">
      {/* Header row */}
      <div className="px-3 py-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setDiffOpen((v) => !v)}
          className="flex items-center gap-2 min-w-0 flex-1"
        >
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
          <span className="shrink-0 text-(--color-fg-dim)">
            {diffOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          </span>
        </button>
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

      {/* Diff preview (expandable) */}
      {diffOpen && diffLines.length > 0 && (
        <div className="border-t border-(--color-accent)/20">
          {loading && (
            <div className="px-3 py-2 text-[11px] text-(--color-fg-dim)">Загрузка diff...</div>
          )}
          {!loading && (
            <pre
              className="max-h-[240px] overflow-auto bg-(--color-bg) py-2 font-mono text-[11px] leading-5"
              style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "normal" }}
            >
              {diffLines.map((line, index) => (
                <div key={index} className={clsx("px-3 whitespace-pre-wrap", diffLineClass(line))}>
                  {line || " "}
                </div>
              ))}
            </pre>
          )}
        </div>
      )}
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
    <div className="pi-chat-scaled my-1 rounded-lg border border-(--color-accent)/30 bg-(--color-accent)/5 overflow-hidden">
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

// ─── AnalyzeImageToolCall ────────────────────────────────────────────────────

interface AnalyzeResult {
  text: string;
  confidence: number;
  blocks: { text: string; bbox: [number,number,number,number]; confidence: number; line_num: number }[];
  caption: string;
  image_type: string;
  colors: { r: number; g: number; b: number; name: string; pct: number }[];
  metadata: { width: number; height: number; format: string; size_bytes: number; has_transparency: boolean };
  latency_hint: string;
  error?: string;
}

function parseAnalyzeResult(block: UiBlockTool): { ok: false } | { ok: true; data: AnalyzeResult } {
  const details = asRecord(block.details);
  if (details && typeof details.text === "string") {
    return { ok: true, data: details as unknown as AnalyzeResult };
  }
  const output = block.output;
  if (typeof output === "string") {
    try { return { ok: true, data: JSON.parse(output) }; } catch {}
  }
  return { ok: false };
}

function AnalyzeImageToolCall({
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
  const imagePath = String(input.image_path ?? "");
  const parsed = parseAnalyzeResult(block);
  const hasImages = block.images && block.images.length > 0;

  const data: AnalyzeResult | null = parsed.ok ? parsed.data : null;
  const textLines = data?.text ? data.text.split("\n") : [];
  const confPct = data ? Math.round(data.confidence * 100) : null;
  const confColor =
    confPct != null
      ? confPct > 90 ? "text-(--color-success)"
        : confPct > 60 ? "text-(--color-warning)"
        : "text-(--color-danger)"
      : "";
  const m = data?.metadata;

  // Build summary line
  const summaryParts: string[] = [];
  if (data?.image_type && data.image_type !== "unknown") summaryParts.push(data.image_type);
  if (m?.width && m?.height) summaryParts.push(`${m.width}×${m.height}`);
  if (confPct != null) summaryParts.push(`${confPct}%`);
  if (data?.caption) summaryParts.push(`“${data.caption.length > 40 ? data.caption.slice(0, 40) + "…" : data.caption}”`);
  if (textLines.length > 0) summaryParts.push(`${textLines.length} lines`);
  const summary = summaryParts.join(" · ");

  return (
    <div
      className={clsx(
        "pi-chat-scaled my-1 rounded-md border text-xs",
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
          <Search size={12} className="text-(--color-accent)" />
        )}
        <span className="font-mono text-(--color-accent)">analyze_image</span>
        <span className="font-mono text-(--color-fg) truncate min-w-0" title={imagePath}>
          {imagePath.split("/").pop()}
        </span>
        <span className={clsx("ml-auto shrink-0 truncate max-w-[200px]", {
          "text-(--color-warning)": isRunning,
          "text-(--color-danger)": isError,
          "text-(--color-fg-dim)": !isRunning && !isError,
        })}>
          {isRunning ? "⏳ analyzing…" : isError ? (data?.error || "error") : summary || "done"}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-2 space-y-2">
          {/* Image preview */}
          {hasImages && <ToolImages images={block.images} />}

          {/* Running / progress (show onUpdate messages) */}
          {isRunning && !data && (
            <div>
              <div className="flex items-center gap-2 text-(--color-warning) text-[11px]">
                <span className="inline-block w-3 h-3 rounded-full border-2 border-(--color-warning) border-t-transparent animate-spin" />
                <span>Processing…</span>
              </div>
              {/* Show intermediate onUpdate content blocks */}
              {block.output != null && typeof block.output === "object" && Array.isArray(block.output) && block.output.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {block.output.map((msg: any, i: number) => (
                    <div key={i} className="text-[11px] text-(--color-fg-mute)">
                      {msg.text ?? JSON.stringify(msg)}
                    </div>
                  ))}
                </div>
              )}
              {block.output != null && typeof block.output === "string" && block.output.length > 0 && (
                <div className="text-[11px] text-(--color-fg-mute) mt-1">
                  {block.output}
                </div>
              )}
            </div>
          )}

          {/* Error / Cancelled */}
          {data?.error && (
            <div className="rounded border border-(--color-danger)/20 bg-(--color-danger)/5 p-2 text-(--color-danger) text-[11px]">
              ⚠ {data.error}
            </div>
          )}

          {/* Image type + metadata */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-(--color-fg-dim)">
            {data?.image_type && data.image_type !== "unknown" && (
              <span>📂 type: <span className="text-(--color-fg-mute)">{data.image_type}</span></span>
            )}
            {m?.width && m?.height && (
              <span>{m.width}×{m.height} {m.format.toUpperCase()}</span>
            )}
            {m?.size_bytes != null && (
              <span>{(m.size_bytes / 1024).toFixed(1)}KB</span>
            )}
            {m?.has_transparency && <span>α</span>}
            {data?.latency_hint && <span>({data.latency_hint})</span>}
          </div>

          {/* Dominant colors */}
          {data?.colors && data.colors.length > 0 && (
            <div>
              <div className="text-(--color-fg-dim) mb-0.5">🎨 colors</div>
              <div className="flex flex-wrap gap-1.5">
                {data.colors.map((c, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-(--color-bg) border border-(--color-border)">
                    {c.name} {c.pct}%
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Caption */}
          {data?.caption && (
            <div>
              <div className="text-(--color-fg-dim) mb-0.5">🎯 caption</div>
              <div className="bg-(--color-bg) border border-(--color-border) rounded p-2 whitespace-pre-wrap text-(--color-accent) text-[11px]">
                {data.caption}
              </div>
            </div>
          )}

          {/* OCR text */}
          {data?.text && (
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-(--color-fg-dim)">📝 extracted text</span>
                {confPct != null && (
                  <span className={clsx("font-mono", confColor)}>
                    {confPct}%
                  </span>
                )}
                {data.blocks && data.blocks.length > 0 && (
                  <span className="text-(--color-fg-dim)">{data.blocks.length} words</span>
                )}
              </div>
              <pre className="font-mono text-[11px] whitespace-pre-wrap bg-(--color-bg) border border-(--color-border) rounded p-2 max-h-64 overflow-y-auto">
                {textLines.slice(0, 50).join("\n")}
                {textLines.length > 50 && "\n… (truncated)"}
              </pre>
            </div>
          )}

          {/* Raw output (fallback when no parsed data) */}
          {block.output != null && block.output !== "" && !data && !isRunning && (
            <div>
              <div className="text-(--color-fg-dim) mb-0.5">output</div>
              <pre className="font-mono text-[11px] whitespace-pre-wrap bg-(--color-bg) border border-(--color-border) rounded p-2 max-h-64 overflow-y-auto">
                {pretty(block.output)}
              </pre>
            </div>
          )}

          {/* ─── Debug section ────────────────────────────────────────── */}
          <DebugSection block={block} data={data} imagePath={imagePath} />
        </div>
      )}
    </div>
  );
}

/** Debug-only: show raw details, params, timing for troubleshooting */
function DebugSection({ block, data, imagePath }: { block: UiBlockTool; data: AnalyzeResult | null; imagePath: string }) {
  const [showDebug, setShowDebug] = useState(false);

  const details = asRecord(block.details);
  const input = asRecord(block.input);

  // Collect debug info
  const debugLines: { label: string; value: string }[] = [];

  if (block.status) debugLines.push({ label: "status", value: block.status });

  if (input) {
    Object.entries(input).forEach(([k, v]) => {
      const val = Array.isArray(v) ? v.join(", ") : String(v ?? "");
      if (val) debugLines.push({ label: `param.${k}`, value: val });
    });
  }

  if (data?.latency_hint) debugLines.push({ label: "latency", value: data.latency_hint });

  if (data?.error) debugLines.push({ label: "error", value: data.error });

  if (data?.metadata && !data.metadata.width && !data.metadata.height && !data.metadata.format) {
    debugLines.push({ label: "⚠ metadata", value: "empty/unreadable" });
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setShowDebug((v) => !v)}
        className="flex items-center gap-1.5 text-[10px] text-(--color-fg-dim) hover:text-(--color-accent) hover:bg-(--color-bg-mute) rounded px-1 py-0.5 w-full"
      >
        {showDebug ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        🔧 debug
        {debugLines.length > 0 && !showDebug && (
          <span className="truncate text-(--color-fg-dim) ml-1 opacity-60">
            {debugLines.map((d) => `${d.label}=${d.value}`).join(" · ")}
          </span>
        )}
      </button>
      {showDebug && (
        <div className="space-y-1 mt-1">
          {/* Quick info table */}
          {debugLines.length > 0 && (
            <div className="text-[10px] font-mono">
              {debugLines.map((d) => (
                <div key={d.label} className="flex gap-2">
                  <span className="text-(--color-fg-dim) shrink-0">{d.label}:</span>
                  <span className="text-(--color-fg-mute) break-all">{d.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Raw block.details JSON */}
          {details && Object.keys(details).length > 0 && (
            <>
              <div className="text-[10px] text-(--color-fg-dim) mt-1">details:</div>
              <pre className="font-mono text-[10px] whitespace-pre-wrap bg-(--color-bg) border border-(--color-border) rounded p-1.5 max-h-48 overflow-y-auto text-(--color-fg-mute)">
                {JSON.stringify(details, null, 2)}
              </pre>
            </>
          )}
        </div>
      )}
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
        {images.map((img, idx) =>
          img.dropped ? (
            <div
              key={idx}
              className="flex items-center rounded-md border border-dashed border-(--color-border) px-2 py-1 text-[10px] text-(--color-fg-dim)"
            >
              выгружено из памяти
            </div>
          ) : (
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
          ),
        )}
      </div>
    </div>
  );
}
