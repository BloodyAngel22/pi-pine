/**
 * RPC-мост: тонкая typed-обёртка вокруг tauri commands `rpc_*` и событий
 * `rpc://line` / `rpc://closed` / `rpc://stderr`.
 *
 * Корреляция request/response — по полю `id`.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  ImageContent,
  Model,
  QueueMode,
  RpcResponse,
  RpcSessionState,
  StreamingBehavior,
  ThinkingLevel,
} from "./types";

export interface RpcStartArgs {
  cliPath?: string | null;
  cwd: string;
  provider?: string;
  model?: string;
  sessionFile?: string;
  env?: Record<string, string>;
}

interface RpcLinePayload {
  generation: number;
  line: string;
}
interface RpcClosedPayload {
  generation: number;
  reason?: string;
}

type EventListener = (event: Record<string, unknown>) => void;

let currentGeneration = 0;
let pending = new Map<
  string,
  {
    resolve: (data: RpcResponse) => void;
    reject: (err: Error) => void;
    timer: number;
  }
>();
const eventListeners = new Set<EventListener>();
const closedListeners = new Set<(reason: string) => void>();
const stderrListeners = new Set<(line: string) => void>();

let lineUnlisten: UnlistenFn | null = null;
let closedUnlisten: UnlistenFn | null = null;
let stderrUnlisten: UnlistenFn | null = null;

let reqCounter = 0;

function nextId(): string {
  reqCounter += 1;
  return `r${Date.now().toString(36)}-${reqCounter}`;
}

function rejectAllPending(error: string) {
  for (const [, p] of pending) {
    window.clearTimeout(p.timer);
    p.reject(new Error(error));
  }
  pending.clear();
}

async function ensureSubscribed(): Promise<void> {
  if (lineUnlisten) return;
  lineUnlisten = await listen<RpcLinePayload>("rpc://line", (e) => {
    if (e.payload.generation !== currentGeneration) return;
    handleLine(e.payload.line);
  });
  closedUnlisten = await listen<RpcClosedPayload>("rpc://closed", (e) => {
    if (e.payload.generation !== currentGeneration) return;
    const reason = e.payload.reason ?? "unknown";
    rejectAllPending(`pi завершился: ${reason}`);
    for (const l of closedListeners) l(reason);
  });
  stderrUnlisten = await listen<RpcLinePayload>("rpc://stderr", (e) => {
    if (e.payload.generation !== currentGeneration) return;
    for (const l of stderrListeners) l(e.payload.line);
  });
}

function handleLine(line: string) {
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(line);
  } catch {
    // мусор / невалидный json
    if (import.meta.env.DEV) console.debug("[rpc] non-json line:", line.slice(0, 200));
    return;
  }
  if (!parsed || typeof parsed !== "object") return;
  if (import.meta.env.DEV) console.debug("[rpc<-]", parsed.type, parsed);
  const t = parsed["type"];
  if (t === "response") {
    const resp = parsed as unknown as RpcResponse;
    if (resp.id) {
      const slot = pending.get(resp.id);
      if (slot) {
        pending.delete(resp.id);
        window.clearTimeout(slot.timer);
        slot.resolve(resp);
      }
    }
    return;
  }
  // Все события (включая extension_ui_request) броадкастим — ext store
  // сам разберётся с диалогами/тостами/статусами и сам отправит ответ.
  for (const l of eventListeners) l(parsed);
}

export async function rpcStart(args: RpcStartArgs): Promise<{
  generation: number;
  piPath: string;
}> {
  await ensureSubscribed();
  const result = await invoke<{ generation: number; pi_path: string }>(
    "rpc_start",
    {
      args: {
        cli_path: args.cliPath ?? null,
        cwd: args.cwd,
        provider: args.provider ?? null,
        model: args.model ?? null,
        session_file: args.sessionFile ?? null,
        env: args.env ?? null,
      },
    },
  );
  currentGeneration = result.generation;
  return { generation: result.generation, piPath: result.pi_path };
}

export async function rpcStop(): Promise<void> {
  await invoke("rpc_stop");
  rejectAllPending("rpc_stop");
}

export async function rpcStatus(): Promise<{ running: boolean; generation: number }> {
  return invoke("rpc_status");
}

async function sendRaw(payload: Record<string, unknown>): Promise<void> {
  const line = JSON.stringify(payload);
  await invoke("rpc_send", { line });
}

function request<T = unknown>(
  command: string,
  payload: Record<string, unknown> = {},
  timeoutMs = 30_000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = nextId();
    const timer = window.setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Тайм-аут ответа на ${command}`));
    }, timeoutMs);
    pending.set(id, {
      resolve: (resp) => {
        if (!resp.success) {
          reject(new Error(resp.error || `${command} failed`));
        } else {
          resolve(resp.data as T);
        }
      },
      reject,
      timer,
    });
    const line = JSON.stringify({ id, type: command, ...payload });
    invoke("rpc_send", { line }).catch((err) => {
      const slot = pending.get(id);
      if (slot) {
        pending.delete(id);
        window.clearTimeout(slot.timer);
      }
      reject(new Error(String(err)));
    });
  });
}

// === fire-and-forget ===

export async function sendPrompt(
  message: string,
  opts?: {
    images?: ImageContent[];
    streamingBehavior?: StreamingBehavior;
  },
): Promise<void> {
  await request("prompt", {
    message,
    ...(opts?.images?.length ? { images: opts.images } : {}),
    ...(opts?.streamingBehavior
      ? { streamingBehavior: opts.streamingBehavior }
      : {}),
  });
}

export async function askBtw(question: string): Promise<{ answer: string }> {
  return request("btw", { question }, 120_000);
}

export interface FastContextFile {
  path: string;
  ranges?: string[];
  score?: number;
  reason?: string;
}
export interface FastContextResult {
  query?: string;
  files: FastContextFile[];
  fallback?: "lexical";
  elapsedMs?: number;
}
export async function fastContext(query: string): Promise<FastContextResult> {
  return request<FastContextResult>("fast_context", { query }, 120_000);
}

export interface FastFetchToolDetails {
  url?: string;
  mode?: "search" | "url";
  status?: number;
  contentType?: string;
  truncated?: boolean;
  bytes?: number;
}
export interface FastFetchResult {
  text: string;
  details?: FastFetchToolDetails;
}
export interface FastFetchOptions {
  mode?: "search" | "url";
  maxResults?: number;
  timeoutMs?: number;
}
export async function fastFetch(
  query: string,
  options?: FastFetchOptions,
): Promise<FastFetchResult> {
  return request<FastFetchResult>("fast_fetch", { query, ...options }, options?.timeoutMs ?? 120_000);
}

export async function abort(): Promise<void> {
  await request("abort").catch(() => undefined);
}

export async function newSession(parentSession?: string): Promise<{ cancelled: boolean }> {
  return request("new_session", parentSession ? { parentSession } : {});
}

export async function switchSession(sessionPath: string): Promise<void> {
  // pi RPC ожидает поле `sessionPath`, не `sessionFile`.
  await request("switch_session", { sessionPath });
}

export interface NavigateTreeResult {
  editorText?: string;
  cancelled: boolean;
  aborted?: boolean;
}

export async function navigateTree(
  targetId: string,
  opts?: { summarize?: boolean; customInstructions?: string; label?: string; exact?: boolean },
): Promise<NavigateTreeResult> {
  return request<NavigateTreeResult>("navigate_tree", { targetId, ...opts });
}

export interface SessionTreeEntry {
  type: string;
  id: string;
  parentId: string | null;
  timestamp: string;
  message?: import("./types").AgentMessage;
  label?: string;
  summary?: string;
  customType?: string;
  name?: string;
  [k: string]: unknown;
}

export interface SessionTreeNode {
  entry: SessionTreeEntry;
  children: SessionTreeNode[];
  label?: string;
  labelTimestamp?: string;
}

export async function getSessionTree(): Promise<{ tree: SessionTreeNode[]; leafId: string | null }> {
  return request("get_session_tree");
}

export async function setSessionName(name: string): Promise<void> {
  await request("set_session_name", { name });
}

export async function getState(): Promise<RpcSessionState> {
  return request<RpcSessionState>("get_state");
}

export interface CwdCommandResult {
  cwd: string;
  displayPath: string;
  entries: string;
}

export interface CompactResult {
  summary?: string;
  firstKeptEntryId?: string;
  tokensBefore?: number;
  tokensAfter?: number;
  details?: unknown;
}

export interface LsCommandResult {
  path: string;
  displayPath: string;
  entries: string;
}

export async function cd(path: string): Promise<CwdCommandResult> {
  return request<CwdCommandResult>("cd", { path });
}

export async function pwd(): Promise<{ cwd: string }> {
  return request<{ cwd: string }>("pwd");
}

export async function ls(path?: string): Promise<LsCommandResult> {
  return request<LsCommandResult>("ls", path ? { path } : {});
}

export async function getMessages(): Promise<{ messages: unknown[] }> {
  return request("get_messages");
}

export async function setModel(provider: string, modelId: string): Promise<Model> {
  return request<Model>("set_model", { provider, modelId });
}

export async function cycleModel(): Promise<{ model: Model | null; thinkingLevel: ThinkingLevel } | null> {
  return request("cycle_model");
}

export async function getAvailableModels(): Promise<Model[] | { models: Model[] }> {
  return request("get_available_models");
}

export async function setThinkingLevel(level: ThinkingLevel): Promise<void> {
  await request("set_thinking_level", { level });
}

export async function setSteeringMode(mode: QueueMode): Promise<void> {
  await request("set_steering_mode", { mode });
}

export async function setFollowUpMode(mode: QueueMode): Promise<void> {
  await request("set_follow_up_mode", { mode });
}

export async function compact(): Promise<CompactResult> {
  return request<CompactResult>("compact", {}, 120_000);
}

export async function setAutoCompaction(enabled: boolean): Promise<void> {
  await request("set_auto_compaction", { enabled });
}

// === v0.2 ===

export interface BashResult {
  output: string;
  exitCode: number;
  cancelled: boolean;
  truncated: boolean;
  fullOutputPath?: string;
}
export async function bash(command: string, timeoutMs = 120_000): Promise<BashResult> {
  return request<BashResult>("bash", { command }, timeoutMs);
}
export async function abortBash(): Promise<void> {
  await request("abort_bash").catch(() => undefined);
}
export async function fork(
  entryId: string,
  opts?: { position?: "at" | "before" },
): Promise<{ text: string; cancelled: boolean }> {
  return request("fork", { entryId, ...opts });
}

/** Обрезать JSONL-файл сессии до строки с entryId (включительно). */
export async function truncateSession(file: string, entryId: string): Promise<void> {
  await invoke("truncate_session_at", { file, entryId });
}
export async function clone(): Promise<{ cancelled: boolean }> {
  return request("clone");
}
export interface ForkPoint {
  id?: string;
  entryId?: string;
  text: string;
  timestamp?: number | string;
}
export async function getForkMessages(): Promise<{ messages: ForkPoint[] }> {
  return request("get_fork_messages");
}
export interface FileCheckpointStatus {
  modified: string[];
  created: string[];
}
export interface FileCheckpointRestoreResult {
  restored: string[];
  deleted: string[];
  errors: string[];
}
export async function getFileCheckpointStatus(): Promise<FileCheckpointStatus | null> {
  return request("get_file_checkpoint_status");
}
export async function getFileCheckpointTurnStatus(turnIndex: number): Promise<FileCheckpointStatus | null> {
  return request("get_file_checkpoint_turn_status", { turnIndex });
}
export async function restoreFileChangesToTurn(turnIndex: number): Promise<FileCheckpointRestoreResult | null> {
  return request("restore_file_changes_to_turn", { turnIndex }, 120_000);
}
export interface SessionStats {
  sessionFile?: string;
  sessionId?: string;
  userMessages?: number;
  assistantMessages?: number;
  toolCalls?: number;
  toolResults?: number;
  totalMessages?: number;
  tokens?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    total?: number;
  };
  cost?: number;
  /** Текущая оценка заполнения LLM context window; не путать с cumulative tokens.total. */
  contextUsage?: {
    tokens: number | null;
    contextWindow: number;
    percent: number | null;
  };
  [k: string]: unknown;
}
export async function getSessionStats(): Promise<SessionStats> {
  return request("get_session_stats");
}
export async function exportHtml(outputPath?: string): Promise<{ path: string }> {
  return request("export_html", outputPath ? { outputPath } : {});
}
export interface PiCommand {
  name: string;
  description?: string;
  source: "extension" | "markdown" | "prompt" | "skill";
  sourceInfo?: {
    source?: string;
    scope?: string;
    displayName?: string;
    path?: string;
    baseDir?: string;
  };
  location?: "user" | "project" | "path";
  path?: string;
}
export async function getCommands(): Promise<{ commands: PiCommand[] }> {
  return request("get_commands");
}
export async function cycleThinkingLevel(): Promise<RpcSessionState> {
  return request("cycle_thinking_level");
}
export async function setAutoRetry(enabled: boolean): Promise<void> {
  await request("set_auto_retry", { enabled });
}
export async function abortRetry(): Promise<void> {
  await request("abort_retry").catch(() => undefined);
}

/** Ответ на extension UI dialog request (select/confirm/input/editor). */
export async function sendExtUiResponse(
  id: string,
  payload: {
    value?: string;
    confirmed?: boolean;
    cancelled?: boolean;
    decision?: "allow-once" | "allow-always" | "deny-once" | "deny-always";
    scope?: "local" | "global" | "session";
    match?: string;
  },
): Promise<void> {
  // Это fire-and-forget по протоколу; pi сам ждёт по `id`.
  await invoke("rpc_send", {
    line: JSON.stringify({ type: "extension_ui_response", id, ...payload }),
  });
}

// === подписки ===

export function onEvent(fn: EventListener): () => void {
  eventListeners.add(fn);
  return () => eventListeners.delete(fn);
}
export function onClosed(fn: (reason: string) => void): () => void {
  closedListeners.add(fn);
  return () => closedListeners.delete(fn);
}
export function onStderr(fn: (line: string) => void): () => void {
  stderrListeners.add(fn);
  return () => stderrListeners.delete(fn);
}
