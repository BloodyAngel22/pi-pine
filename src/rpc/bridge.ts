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
  McpStatusResult,
  Model,
  QueueMode,
  RpcResponse,
  RpcSessionState,
  SkillDetail,
  SkillSuggestion,
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

export interface RpcRequestOptions {
  sessionId?: string | null;
  timeoutMs?: number;
}

export interface SessionListItem {
  sessionId: string;
  name?: string;
  messageCount: number;
  isActive: boolean;
  cwd?: string;
  isStreaming: boolean;
}

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
  timeoutOrOptions: number | RpcRequestOptions = 30_000,
): Promise<T> {
  const timeoutMs = typeof timeoutOrOptions === "number" ? timeoutOrOptions : timeoutOrOptions.timeoutMs ?? 30_000;
  const sessionId = typeof timeoutOrOptions === "number" ? undefined : timeoutOrOptions.sessionId ?? undefined;
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
    const line = JSON.stringify({ id, type: command, ...payload, ...(sessionId ? { sessionId } : {}) });
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
    sessionId?: string | null;
  },
): Promise<void> {
  await request("prompt", {
    message,
    ...(opts?.images?.length ? { images: opts.images } : {}),
    ...(opts?.streamingBehavior
      ? { streamingBehavior: opts.streamingBehavior }
      : {}),
  }, { sessionId: opts?.sessionId });
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
export async function fastContext(query: string, sessionId?: string | null): Promise<FastContextResult> {
  return request<FastContextResult>("fast_context", { query }, { sessionId, timeoutMs: 120_000 });
}

export interface WebSearchToolDetails {
  url?: string;
  mode?: "search" | "url";
  status?: number;
  contentType?: string;
  truncated?: boolean;
  bytes?: number;
  blocked?: boolean;
  challengeType?: string;
  headlessAttempted?: boolean;
  headlessUsed?: boolean;
  retries?: number;
}
export interface WebSearchResult {
  text: string;
  details?: WebSearchToolDetails;
}
export interface WebSearchOptions {
  mode?: "search" | "url";
  maxResults?: number;
  timeoutMs?: number;
}
export async function webSearch(
  query: string,
  options?: WebSearchOptions & { sessionId?: string | null },
): Promise<WebSearchResult> {
  const { sessionId, ...payloadOptions } = options ?? {};
  return request<WebSearchResult>("web_search", { query, ...payloadOptions }, { sessionId, timeoutMs: options?.timeoutMs ?? 120_000 });
}

export async function abort(sessionId?: string | null): Promise<void> {
  await request("abort", {}, { sessionId }).catch(() => undefined);
}

export async function newSession(parentSession?: string, sessionId?: string | null): Promise<{ cancelled: boolean }> {
  return request("new_session", parentSession ? { parentSession } : {}, { sessionId });
}

export async function createSession(options?: string | { cwd?: string; mode?: "empty" | "copy"; sourceSessionId?: string | null; sessionPath?: string | null }): Promise<{ sessionId: string }> {
  const payload = typeof options === "string" ? { cwd: options } : { ...(options ?? {}) };
  return request("create_session", payload);
}

export async function switchActiveSession(sessionId: string): Promise<void> {
  await request("switch_active_session", {}, { sessionId });
}

export async function closeSession(sessionId: string): Promise<void> {
  await request("close_session", {}, { sessionId });
}

export async function listSessions(): Promise<{ sessions: SessionListItem[] }> {
  return request("list_sessions");
}

export async function switchSession(sessionPath: string, sessionId?: string | null): Promise<void> {
  // pi RPC ожидает поле `sessionPath`, не `sessionFile`.
  await request("switch_session", { sessionPath }, { sessionId });
}

export interface NavigateTreeResult {
  editorText?: string;
  cancelled: boolean;
  aborted?: boolean;
}

export async function navigateTree(
  targetId: string,
  opts?: { summarize?: boolean; customInstructions?: string; label?: string; exact?: boolean; sessionId?: string | null },
): Promise<NavigateTreeResult> {
  const { sessionId, ...payloadOpts } = opts ?? {};
  return request<NavigateTreeResult>("navigate_tree", { targetId, ...payloadOpts }, { sessionId });
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

export async function getSessionTree(sessionId?: string | null): Promise<{ tree: SessionTreeNode[]; leafId: string | null }> {
  return request("get_session_tree", {}, { sessionId });
}

export async function setSessionName(name: string, sessionId?: string | null): Promise<void> {
  await request("set_session_name", { name }, { sessionId });
}

export async function getState(sessionId?: string | null): Promise<RpcSessionState> {
  return request<RpcSessionState>("get_state", {}, { sessionId });
}

export async function getMcpStatus(sessionId?: string | null): Promise<McpStatusResult> {
  return request<McpStatusResult>("get_mcp_status", {}, { sessionId });
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

export async function cd(path: string, sessionId?: string | null): Promise<CwdCommandResult> {
  return request<CwdCommandResult>("cd", { path }, { sessionId });
}

export async function pwd(sessionId?: string | null): Promise<{ cwd: string }> {
  return request<{ cwd: string }>("pwd", {}, { sessionId });
}

export async function ls(path?: string, sessionId?: string | null): Promise<LsCommandResult> {
  return request<LsCommandResult>("ls", path ? { path } : {}, { sessionId });
}

export async function getMessages(sessionId?: string | null): Promise<{ messages: unknown[] }> {
  return request("get_messages", {}, { sessionId });
}

export async function setModel(provider: string, modelId: string, sessionId?: string | null): Promise<Model> {
  return request<Model>("set_model", { provider, modelId }, { sessionId });
}

export async function cycleModel(sessionId?: string | null): Promise<{ model: Model | null; thinkingLevel: ThinkingLevel } | null> {
  return request("cycle_model", {}, { sessionId });
}

export async function getAvailableModels(): Promise<Model[] | { models: Model[] }> {
  return request("get_available_models");
}

export async function setThinkingLevel(level: ThinkingLevel, sessionId?: string | null): Promise<void> {
  await request("set_thinking_level", { level }, { sessionId });
}

export async function setSteeringMode(mode: QueueMode, sessionId?: string | null): Promise<void> {
  await request("set_steering_mode", { mode }, { sessionId });
}

export async function setFollowUpMode(mode: QueueMode, sessionId?: string | null): Promise<void> {
  await request("set_follow_up_mode", { mode }, { sessionId });
}

export async function loadAgentPreset(name: string, sessionId?: string | null): Promise<import("./types").AgentPresetConfig> {
  return request<import("./types").AgentPresetConfig>("load_agent_preset", { presetName: name }, { sessionId });
}

export async function setCustomInstructions(instructions: string, sessionId?: string | null): Promise<void> {
  await request("set_custom_instructions", { instructions }, { sessionId });
}

export async function compact(sessionId?: string | null): Promise<CompactResult> {
  return request<CompactResult>("compact", {}, { sessionId, timeoutMs: 120_000 });
}

export async function setAutoCompaction(enabled: boolean, sessionId?: string | null): Promise<void> {
  await request("set_auto_compaction", { enabled }, { sessionId });
}

export async function setContextPruning(enabled: boolean, sessionId?: string | null): Promise<void> {
  await request("set_context_pruning", { enabled }, { sessionId });
}

// === v0.2 ===

export interface BashResult {
  output: string;
  exitCode: number;
  cancelled: boolean;
  truncated: boolean;
  fullOutputPath?: string;
}
export async function bash(command: string, timeoutMs = 120_000, sessionId?: string | null): Promise<BashResult> {
  return request<BashResult>("bash", { command }, { sessionId, timeoutMs });
}
export async function abortBash(sessionId?: string | null): Promise<void> {
  await request("abort_bash", {}, { sessionId }).catch(() => undefined);
}
export async function fork(
  entryId: string,
  opts?: { position?: "at" | "before"; sessionId?: string | null },
): Promise<{ text: string; cancelled: boolean }> {
  const { sessionId, ...payloadOpts } = opts ?? {};
  return request("fork", { entryId, ...payloadOpts }, { sessionId });
}

/** Обрезать JSONL-файл сессии до строки с entryId (включительно). */
export async function truncateSession(file: string, entryId: string): Promise<void> {
  await invoke("truncate_session_at", { file, entryId });
}
export async function clone(sessionId?: string | null): Promise<{ cancelled: boolean }> {
  return request("clone", {}, { sessionId });
}
export interface ForkPoint {
  id?: string;
  entryId?: string;
  text: string;
  timestamp?: number | string;
}
export async function getForkMessages(sessionId?: string | null): Promise<{ messages: ForkPoint[] }> {
  return request("get_fork_messages", {}, { sessionId });
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
export async function getFileCheckpointStatus(sessionId?: string | null): Promise<FileCheckpointStatus | null> {
  return request("get_file_checkpoint_status", {}, { sessionId });
}
export async function getFileCheckpointTurnStatus(turnIndex: number, sessionId?: string | null): Promise<FileCheckpointStatus | null> {
  return request("get_file_checkpoint_turn_status", { turnIndex }, { sessionId });
}
export async function restoreFileChangesToTurn(turnIndex: number, sessionId?: string | null): Promise<FileCheckpointRestoreResult | null> {
  return request("restore_file_changes_to_turn", { turnIndex }, { sessionId, timeoutMs: 120_000 });
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
export async function getSessionStats(sessionId?: string | null): Promise<SessionStats> {
  return request("get_session_stats", {}, { sessionId });
}
export async function exportHtml(outputPath?: string, sessionId?: string | null): Promise<{ path: string }> {
  return request("export_html", outputPath ? { outputPath } : {}, { sessionId });
}
export interface PiCommand {
  name: string;
  description?: string;
  categories?: string[];
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
export async function getCommands(sessionId?: string | null): Promise<{ commands: PiCommand[] }> {
  return request("get_commands", {}, { sessionId });
}
export async function getSkillDetail(name: string, sessionId?: string | null): Promise<SkillDetail> {
  return request("get_skill_detail", { name }, { sessionId });
}
export async function suggestSkills(query: string, options?: { limit?: number; minScore?: number; sessionId?: string | null }): Promise<{ skills: SkillSuggestion[] }> {
  const { sessionId, ...payload } = options ?? {};
  return request("suggest_skills", { query, ...payload }, { sessionId });
}
export async function cycleThinkingLevel(sessionId?: string | null): Promise<RpcSessionState> {
  return request("cycle_thinking_level", {}, { sessionId });
}
export async function setAutoRetry(enabled: boolean, sessionId?: string | null): Promise<void> {
  await request("set_auto_retry", { enabled }, { sessionId });
}
export async function abortRetry(sessionId?: string | null): Promise<void> {
  await request("abort_retry", {}, { sessionId }).catch(() => undefined);
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
