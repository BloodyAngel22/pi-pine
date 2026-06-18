import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import * as rpc from "@/rpc/bridge";
import { useVirtualDisplay } from "@/store/virtualDisplay";
import { useExt } from "@/store/ext";
import { useUiPrefs } from "@/store/uiPrefs";
import type {
  AnyContent,
  Model,
  RpcSessionState,
  StreamingBehavior,
  ThinkingLevel,
  AttachmentContent,
} from "@/rpc/types";

/** Мини-модель сообщения для рендера */
export interface UiBlockText {
  kind: "text";
  text: string;
}
export interface UiBlockThinking {
  kind: "thinking";
  text: string;
}
export interface UiBlockTool {
  kind: "tool";
  toolUseId: string;
  name: string;
  input?: unknown;
  output?: unknown;
  details?: unknown;
  /** Изображения, встроенные в результат инструмента (screenshot/interact) */
  images?: UiBlockImage[];
  status: "running" | "done" | "error" | "pending";
}
export interface UiBlockImage {
  kind: "image";
  mimeType: string;
  data: string;
}
export type UiBlock =
  | UiBlockText
  | UiBlockThinking
  | UiBlockTool
  | UiBlockImage;

export interface UiMessage {
  id: string;
  role: "user" | "assistant" | "system";
  blocks: UiBlock[];
  /** В процессе стриминга? */
  streaming: boolean;
  timestamp: number;
  /** Локально добавленное сообщение до подтверждения/echo от pi RPC. */
  optimistic?: boolean;
  /** Локальный echo пользовательского prompt-а; нужен для склейки с реальным pi message. */
  localEcho?: boolean;
  /** Ошибка отправки локального optimistic-сообщения. */
  error?: string;
  /** Локальный placeholder ассистента до первого реального message/tool event. */
  pendingAssistant?: boolean;
}

export const DEFAULT_TAB_ID = "session-1";

export interface SessionTabState {
  tabId: string;
  messages: UiMessage[];
  agentState: RpcSessionState | null;
  currentAssistantId: string | null;
  messageIdMap: Map<string, string>;
  uiToPiId: Record<string, string>;
  sessionName: string | null;
  sessionStats: import("@/rpc/bridge").SessionStats | null;
  pendingMessageCount: number;
  unseenAssistantCount: number;
  fastContextStatus: "idle" | "searching" | "done" | "error" | null;
  fastContextResults: import("@/rpc/bridge").FastContextResult | null;
  fastContextQuery: string | null;
  fastContextError: string | null;
  fastContextRunId: number;
  fastFetchStatus: "idle" | "fetching" | "done" | "error" | null;
  fastFetchResult: import("@/rpc/bridge").FastFetchResult | null;
  fastFetchQuery: string | null;
  fastFetchError: string | null;
  fastFetchRunId: number;
  lastCompactionMessageKey: string | null;
  retryStatus: {
    active: boolean;
    attempt: number;
    maxAttempts?: number;
    delayMs?: number;
    errorMessage?: string;
    finalError?: string;
  };
  planMode: boolean;
  planFilePath: string | null;
  planLoading: boolean;
  forkBanner: string | null;
  composerInjection: { text: string; nonce: number } | null;
  composerValue: string;
  composerHistory: string[];
  composerHistoryIndex: number;
  composerAttachments: AttachmentContent[];
  /** Skills pinned to this specific session/tab. */
  attachedSkills: string[];
  pendingUserAction: { kind: "permission" | "askUser"; count: number } | null;
}

export function createDefaultSessionTab(tabId: string, initial?: Partial<SessionTabState>): SessionTabState {
  return {
    tabId,
    messages: [],
    agentState: null,
    currentAssistantId: null,
    messageIdMap: new Map(),
    uiToPiId: {},
    sessionName: null,
    sessionStats: null,
    pendingMessageCount: 0,
    unseenAssistantCount: 0,
    fastContextStatus: null,
    fastContextResults: null,
    fastContextQuery: null,
    fastContextError: null,
    fastContextRunId: 0,
    fastFetchStatus: null,
    fastFetchResult: null,
    fastFetchQuery: null,
    fastFetchError: null,
    fastFetchRunId: 0,
    lastCompactionMessageKey: null,
    retryStatus: { active: false, attempt: 0 },
    planMode: readPlanMode(),
    planFilePath: null,
    planLoading: false,
    forkBanner: null,
    composerInjection: null,
    composerValue: "",
    composerHistory: [],
    composerHistoryIndex: -1,
    composerAttachments: [],
    attachedSkills: readAttachedSkillsFromId(tabId),
    pendingUserAction: null,
    ...initial,
  };
}

type SessionTabPatch = Partial<Omit<SessionTabState, "tabId">>;

const TAB_FIELD_KEYS = new Set<keyof SessionTabState>([
  "messages",
  "agentState",
  "currentAssistantId",
  "messageIdMap",
  "uiToPiId",
  "sessionName",
  "sessionStats",
  "pendingMessageCount",
  "unseenAssistantCount",
  "fastContextStatus",
  "fastContextResults",
  "fastContextQuery",
  "fastContextError",
  "fastContextRunId",
  "fastFetchStatus",
  "fastFetchResult",
  "fastFetchQuery",
  "fastFetchError",
  "fastFetchRunId",
  "lastCompactionMessageKey",
  "retryStatus",
  "planMode",
  "planFilePath",
  "planLoading",
  "forkBanner",
  "composerInjection",
  "composerValue",
  "composerHistory",
  "composerHistoryIndex",
  "composerAttachments",
  "attachedSkills",
  "pendingUserAction",
]);

function pickTabPatch(partial: Partial<ChatState>): SessionTabPatch {
  const patch: SessionTabPatch = {};
  for (const key of TAB_FIELD_KEYS) {
    if (key in partial) {
      (patch as Record<string, unknown>)[key] = (partial as Record<string, unknown>)[key as string];
    }
  }
  return patch;
}

function tabProjection(tab: SessionTabState): Partial<ChatState> {
  return {
    planMode: tab.planMode,
    planFilePath: tab.planFilePath,
    planLoading: tab.planLoading,
    agentState: tab.agentState,
    retryStatus: tab.retryStatus,
    pendingMessageCount: tab.pendingMessageCount,
    sessionStats: tab.sessionStats,
    uiToPiId: tab.uiToPiId,
    messages: tab.messages,
    currentAssistantId: tab.currentAssistantId,
    messageIdMap: tab.messageIdMap,
    composerInjection: tab.composerInjection,
    composerValue: tab.composerValue,
    composerHistory: tab.composerHistory,
    composerHistoryIndex: tab.composerHistoryIndex,
    composerAttachments: tab.composerAttachments,
    attachedSkills: tab.attachedSkills,
    pendingUserAction: tab.pendingUserAction,
    forkBanner: tab.forkBanner,
    fastContextStatus: tab.fastContextStatus,
    fastContextResults: tab.fastContextResults,
    fastContextQuery: tab.fastContextQuery,
    fastContextError: tab.fastContextError,
    fastContextRunId: tab.fastContextRunId,
    fastFetchStatus: tab.fastFetchStatus,
    fastFetchResult: tab.fastFetchResult,
    fastFetchQuery: tab.fastFetchQuery,
    fastFetchError: tab.fastFetchError,
    fastFetchRunId: tab.fastFetchRunId,
    lastCompactionMessageKey: tab.lastCompactionMessageKey,
  };
}

interface ChatState {
  // транспорт
  generation: number;
  rpcRunning: boolean;
  mcpLoading: boolean;
  piPath: string | null;
  cliPathOverride: string | null;
  cwd: string;
  /** $HOME пользователя (для сокращения путей до ~). */
  home: string | null;
  // plan mode
  planMode: boolean;
  planFilePath: string | null;
  planLoading: boolean;
  // скиллы, прикреплённые к текущей сессии/tab
  attachedSkills: string[];
  // сессия переключается? (для UI-спиннера)
  switching: boolean;
  // состояние агента
  agentState: RpcSessionState | null;
  retryStatus: {
    active: boolean;
    attempt: number;
    maxAttempts?: number;
    delayMs?: number;
    errorMessage?: string;
    finalError?: string;
  };
  availableModels: Model[];
  pendingMessageCount: number;
  sessionStats: import("@/rpc/bridge").SessionStats | null;
  /** id pi user-message (нужен для fork/regenerate) для каждого UI-сообщения */
  uiToPiId: Record<string, string>;
  // сообщения
  messages: UiMessage[];
  /** id текущего стримящегося ассистент-сообщения (UI id) */
  currentAssistantId: string | null;
  /** маппинг pi messageId → UI message id */
  messageIdMap: Map<string, string>;
  // ui
  streamingBehavior: StreamingBehavior;
  errorBanner: string | null;
  stderrBuffer: string[];
  /** буфер для подстановки в композер из set_editor_text / Edit */
  composerInjection: { text: string; nonce: number } | null;
  /** Черновик composer-а активного таба. */
  composerValue: string;
  composerHistory: string[];
  composerHistoryIndex: number;
  composerAttachments: AttachmentContent[];
  pendingUserAction: { kind: "permission" | "askUser"; count: number } | null;
  /** баннер после fork: пользователь теперь в новой ветке */
  forkBanner: string | null;
  /** Fast Context статус и результаты */
  fastContextStatus: "idle" | "searching" | "done" | "error" | null;
  fastContextResults: import("@/rpc/bridge").FastContextResult | null;
  fastContextQuery: string | null;
  fastContextError: string | null;
  fastContextRunId: number;
  /** Fast Fetch статус и результаты */
  fastFetchStatus: "idle" | "fetching" | "done" | "error" | null;
  fastFetchResult: import("@/rpc/bridge").FastFetchResult | null;
  fastFetchQuery: string | null;
  fastFetchError: string | null;
  fastFetchRunId: number;
  lastCompactionMessageKey: string | null;
  // multi-session tabs
  tabs: Map<string, SessionTabState>;
  tabOrder: string[];
  activeTabId: string | null;
  activateTab(tabId: string): Promise<void>;
  createSessionTab(name?: string, options?: { mode?: "empty" | "copy"; sourceSessionId?: string | null; sessionPath?: string | null }): Promise<string | null>;
  createForkTab(): Promise<string | null>;
  openSessionTab(file: string, name?: string | null, activate?: boolean): Promise<string | null>;
  closeSessionTab(tabId: string): Promise<void>;
  moveTab(fromIndex: number, toIndex: number): void;
  moveTabById(tabId: string, beforeTabId: string | null): void;
  updateTab(tabId: string, patch: SessionTabPatch): void;
  syncFromTab(tabId: string): void;
  ensureTab(tabId: string, initial?: Partial<SessionTabState>): void;
  // действия
  init(): Promise<void>;
  startRpc(opts?: { sessionFile?: string; safe?: boolean }): Promise<void>;
  stopRpc(): Promise<void>;
  restartRpc(opts?: { safe?: boolean }): Promise<void>;
  send(
    message: string,
    images?: import("@/rpc/types").ImageContent[],
    opts?: {
      streamingBehavior?: StreamingBehavior;
      files?: import("@/rpc/types").FileContent[];
    },
  ): Promise<void>;
  abortStreaming(): Promise<void>;
  clearMessages(): void;
  setCwd(cwd: string): void;
  setHome(home: string | null): void;
  /** Сменить cwd и перезапустить pi RPC. */
  changeCwd(next: string): Promise<void>;
  runSlashCommand(command: string, arg?: string): Promise<void>;
  /** Plan mode actions */
  togglePlanMode(): Promise<void>;
  loadPlan(): Promise<void>;
  savePlan(text: string): Promise<void>;
  commitPlan(): Promise<void>;
  /** Skills */
  setAttachedSkills(names: string[]): void;
  toggleAttachedSkill(name: string): void;
  suggestSkills(query: string): Promise<import("@/rpc/types").SkillSuggestion[]>;
  autoAttachSkills(query: string): Promise<void>;
  setCliPathOverride(p: string | null): void;
  setStreamingBehavior(b: StreamingBehavior): void;
  setAutoRetry(enabled: boolean): Promise<void>;
  abortRetry(): Promise<void>;
  setThinking(level: ThinkingLevel): Promise<void>;
  switchModel(provider: string, modelId: string): Promise<void>;
  loadAvailableModels(): Promise<void>;
  refreshState(): Promise<void>;
  refreshSessionStats(): Promise<void>;
  reloadHistory(): Promise<void>;
  newSession(): Promise<void>;
  switchSession(file: string): Promise<void>;
  setSessionName(name: string): Promise<void>;
  forkAt(uiMessageId: string): Promise<void>;
  regenerateAt(uiMessageId: string): Promise<void>;
  editUserMessage(uiMessageId: string, text: string): Promise<void>;
  clearForkBanner(): void;
  runFastContext(query: string): Promise<void>;
  clearFastContext(): void;
  runFastFetch(query: string, options?: import("@/rpc/bridge").FastFetchOptions): Promise<void>;
  clearFastFetch(): void;
  runBash(command: string): Promise<void>;
  injectComposer(text: string): void;
  clearComposerInjection(): void;
  setError(msg: string | null): void;

  /** Add a pending permission block to the current assistant message */
  addPendingPermissionBlock(permId: string, name: string, input: unknown, tabId?: string | null): void;
  /** Remove a pending permission block by permission id */
  removePendingPermissionBlock(permId: string, tabId?: string | null): void;
  /** Add a pending ask_user block to the current assistant message */
  addPendingAskUserBlock(askUserId: string, input: { question: string; options: string[]; allowMultiple: boolean }, tabId?: string | null): void;
  /** Remove a pending ask_user block by askUser id */
  removePendingAskUserBlock(askUserId: string, tabId?: string | null): void;
  markTabWaiting(kind: "permission" | "askUser", tabId?: string | null): void;
  clearTabWaiting(kind: "permission" | "askUser", tabId?: string | null): void;
}

const STORAGE_KEY_CLI = "pi-pine.cliPathOverride";
const STORAGE_KEY_CWD = "pi-pine.cwd";
const STORAGE_KEY_PROVIDER = "pi-pine.provider";
const STORAGE_KEY_MODEL = "pi-pine.model";
const STORAGE_KEY_PLAN_MODE = "pi-pine.planMode";
const STORAGE_KEY_SKILLS_PREFIX_FILE = "pi-pine.attachedSkills.file.";
const STORAGE_KEY_SKILLS_PREFIX_ID = "pi-pine.attachedSkills.id.";
const STORAGE_KEY_OPEN_TABS_PREFIX = "pi-pine.openTabs.";
const SESSIONS_CHANGED_EVENT = "pi-pine:sessions-changed";
const closedTabIds = new Set<string>();

function openTabsStorageKey(cwd: string): string {
  return `${STORAGE_KEY_OPEN_TABS_PREFIX}${cwd}`;
}

interface RememberedOpenTabsState {
  files: string[];
  activeFile?: string;
}

function readRememberedOpenTabs(cwd: string): RememberedOpenTabsState {
  if (!cwd || typeof window === "undefined") return { files: [] };
  try {
    const raw = localStorage.getItem(openTabsStorageKey(cwd));
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      return { files: parsed.filter((x): x is string => typeof x === "string" && x.length > 0) };
    }
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      const files = Array.isArray(obj.files)
        ? obj.files.filter((x): x is string => typeof x === "string" && x.length > 0)
        : [];
      const activeFile = typeof obj.activeFile === "string" ? obj.activeFile : undefined;
      return { files, activeFile };
    }
  } catch {
    // ignore
  }
  return { files: [] };
}

function writeRememberedOpenTabs(cwd: string, state: RememberedOpenTabsState): void {
  if (!cwd || typeof window === "undefined") return;
  const unique = Array.from(new Set(state.files.filter(Boolean)));
  if (unique.length === 0) {
    localStorage.removeItem(openTabsStorageKey(cwd));
  } else {
    localStorage.setItem(openTabsStorageKey(cwd), JSON.stringify({ files: unique, activeFile: state.activeFile }));
  }
}

function notifySessionsChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SESSIONS_CHANGED_EVENT));
  }
}

function readPlanMode(): boolean {
  return localStorage.getItem(STORAGE_KEY_PLAN_MODE) === "1";
}
function normalizeSkillName(s: string): string {
  // Снимаем все ведущие "skill:" — на случай старых записей вида "skill:skill:foo".
  let r = s;
  while (r.startsWith("skill:")) r = r.slice(6);
  return r;
}
function attachedSkillsFileKey(sessionFile: string): string {
  const base = sessionFile
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .pop()
    ?.replace(/\.jsonl$/i, "")
    ?.replace(/[^a-zA-Z0-9_.-]/g, "_")
    ?? sessionFile;
  return `${STORAGE_KEY_SKILLS_PREFIX_FILE}${base}`;
}
function attachedSkillsIdKey(sessionId: string): string {
  return `${STORAGE_KEY_SKILLS_PREFIX_ID}${sessionId}`;
}

function readAttachedSkillsFromFile(sessionFile: string): string[] {
  try {
    const raw = localStorage.getItem(attachedSkillsFileKey(sessionFile));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x) => typeof x === "string")
      .map(normalizeSkillName)
      .filter(Boolean);
  } catch {
    return [];
  }
}
function readAttachedSkillsFromId(sessionId: string): string[] {
  try {
    const raw = localStorage.getItem(attachedSkillsIdKey(sessionId));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x) => typeof x === "string")
      .map(normalizeSkillName)
      .filter(Boolean);
  } catch {
    return [];
  }
}
function writeAttachedSkills(idOrFile: string | null | undefined, names: string[], isFile: boolean): void {
  if (!idOrFile) return;
  const key = isFile ? attachedSkillsFileKey(idOrFile) : attachedSkillsIdKey(idOrFile);
  if (names.length > 0) localStorage.setItem(key, JSON.stringify(names));
  else localStorage.removeItem(key);
}

function migrateAttachedSkillsKey(fromSessionId: string, toSessionFile: string): void {
  const fromKey = attachedSkillsIdKey(fromSessionId);
  const toKey = attachedSkillsFileKey(toSessionFile);
  if (fromKey === toKey) return;
  try {
    const raw = localStorage.getItem(fromKey);
    if (raw === null) return;
    if (localStorage.getItem(toKey) === null) {
      localStorage.setItem(toKey, raw);
    }
    localStorage.removeItem(fromKey);
  } catch {
    // ignore
  }
}

function reconcileAttachedSkillsForSession(
  sessionId: string,
  sessionFile: string | null | undefined,
  current: string[] | null | undefined,
): string[] {
  const currentSkills = Array.from(new Set((current ?? []).map(normalizeSkillName).filter(Boolean)));
  if (!sessionFile) return currentSkills.length > 0 ? currentSkills : readAttachedSkillsFromId(sessionId);

  migrateAttachedSkillsKey(sessionId, sessionFile);
  const fileSkills = readAttachedSkillsFromFile(sessionFile);
  if (fileSkills.length > 0) return fileSkills;

  if (currentSkills.length > 0) {
    writeAttachedSkills(sessionFile, currentSkills, true);
  }
  return currentSkills;
}

function slugify(s: string): string {
  return (s || "plan")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "plan";
}

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Защита от двойной подписки (StrictMode/HMR). */
let initOnce = false;
let mcpLoadingTimer: number | null = null;
/** Когда стартовала текущая MCP-загрузка (чтобы не дать флагу застрять). */
const MCP_LOADING_TIMEOUT_MS = 30_000; // 30 секунд макс
let mcpLoadingStartedAt = 0;
let activeStartPromise: Promise<void> | null = null;
let activeSwitch: { file: string; promise: Promise<void> } | null = null;
const LIVE_STATS_REFRESH_INTERVAL_MS = 750;
let statsRefreshTimer: number | null = null;
let statsRefreshInFlight = false;
let statsRefreshQueued = false;
/** null = ещё не прочитали конфиг; true/false = есть/нет активных MCP-серверов */
let mcpHasServers: boolean | null = null;

function debugMcp(phase: string, payload?: unknown) {
  if (import.meta.env.DEV) {
    console.debug("[mcp]", new Date().toISOString(), phase, payload ?? "");
  }
}

function isMcpLoadingStatus(text: string): boolean {
  const s = text.trim().toLowerCase();
  if (!s) return false;
  if (/\b(connected|loaded|complete|completed|done)\b/.test(s)) return false;
  const ready = s.match(/(?:ready|готов[оы]?)\D+(\d+)\D+(\d+)/i);
  if (ready) return Number(ready[1]) < Number(ready[2]);
  if (/\b\d+\s*\/\s*\d+\b/.test(s)) {
    const m = s.match(/(\d+)\s*\/\s*(\d+)/);
    if (m) return Number(m[1]) < Number(m[2]);
  }
  return /\b(loading|initializing|connecting|starting|загруз|инициализ|подключ)\b/.test(s);
}

function setMcpLoading(
  set: (
    partial:
      | Partial<ChatState>
      | ((s: ChatState) => Partial<ChatState>),
  ) => void,
  loading: boolean,
) {
  // Если MCP не настроен — никогда не показываем индикатор загрузки.
  if (loading && mcpHasServers === false) return;
  if (mcpLoadingTimer != null) {
    window.clearTimeout(mcpLoadingTimer);
    mcpLoadingTimer = null;
  }
  if (loading) {
    // Запоминаем время старта первой загрузки
    if (mcpLoadingStartedAt === 0) {
      mcpLoadingStartedAt = Date.now();
    } else if (Date.now() - mcpLoadingStartedAt >= MCP_LOADING_TIMEOUT_MS) {
      // MCP загружается дольше 30 секунд — принудительно снимаем флаг.
      // Пользователь сможет работать без MCP-инструментов, а MCP догрузится
      // в фоне.
      console.warn("[mcp] Загрузка MCP превысила 30 с, снимаю блокировку");
      mcpLoadingStartedAt = 0;
      set({ mcpLoading: false });
      return;
    }
    set({ mcpLoading: true });
    // Fallback-таймер на случай, если pi перестал слать статусы
    mcpLoadingTimer = window.setTimeout(() => {
      set({ mcpLoading: false });
      mcpLoadingTimer = null;
    }, 3_000);
  } else {
    mcpLoadingStartedAt = 0;
    set({ mcpLoading: false });
  }
}

function scheduleSessionStatsRefresh(get: () => ChatState) {
  if (statsRefreshTimer !== null) return;

  const run = () => {
    statsRefreshTimer = null;

    if (statsRefreshInFlight) {
      statsRefreshQueued = true;
      return;
    }

    statsRefreshInFlight = true;
    void get()
      .refreshSessionStats()
      .catch(() => undefined)
      .finally(() => {
        statsRefreshInFlight = false;
        if (statsRefreshQueued) {
          statsRefreshQueued = false;
          scheduleSessionStatsRefresh(get);
        }
      });
  };

  statsRefreshTimer = window.setTimeout(run, LIVE_STATS_REFRESH_INTERVAL_MS);
}

function clearScheduledSessionStatsRefresh() {
  if (statsRefreshTimer !== null) {
    window.clearTimeout(statsRefreshTimer);
    statsRefreshTimer = null;
  }
  statsRefreshQueued = false;
}

async function rememberCurrentSession(cwd: string, sessionFile?: string) {
  if (!cwd || !sessionFile) return;
  await invoke("write_last_session_file", { cwd, sessionFile }).catch(() => undefined);
}

function collectOpenSessionFiles(state: ChatState): string[] {
  return state.tabOrder
    .map((tabId) => state.tabs.get(tabId)?.agentState?.sessionFile)
    .filter((file): file is string => typeof file === "string" && file.length > 0);
}

function rememberOpenTabsSnapshot(state: ChatState): void {
  const files = collectOpenSessionFiles(state);
  const activeFile = state.agentState?.sessionFile;
  writeRememberedOpenTabs(state.cwd, { files, activeFile });
  if (activeFile) void rememberCurrentSession(state.cwd, activeFile);
}

function joinText(blocks: UiBlock[]): string {
  return blocks
    .filter((b): b is UiBlockText => b.kind === "text")
    .map((b) => b.text)
    .join("");
}

function createOptimisticUserBlocks(
  text: string,
  images?: import("@/rpc/types").ImageContent[],
  files?: import("@/rpc/types").FileContent[],
): UiBlock[] {
  const blocks: UiBlock[] = [];
  if (text.trim()) blocks.push({ kind: "text", text: text.trim() });
  for (const img of images ?? []) {
    blocks.push({ kind: "image", mimeType: img.mimeType, data: img.data });
  }
  if (files && files.length > 0) {
    blocks.push({
      kind: "text",
      text: files.map((f) => `📎 ${f.name} (${f.mimeType})`).join("\n"),
    });
  }
  return blocks;
}

function normalizeForMatch(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function forkPointId(point: rpc.ForkPoint | undefined): string | undefined {
  return point?.id ?? point?.entryId;
}

function extractPiMessageId(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (!value || typeof value !== "object") continue;
    const o = value as Record<string, unknown>;
    const id =
      o.id ??
      o.messageId ??
      o.message_id ??
      o.entryId ??
      o.entry_id ??
      o.uuid;
    if (typeof id === "string" && id) return id;
  }
  return undefined;
}

async function resolveUserForkPiId(
  uiMessageId: string,
  userText: string,
  uiToPiId: Record<string, string>,
  timestamp?: number,
): Promise<string | null> {
  const direct = uiToPiId[uiMessageId];
  if (direct) return direct;
  const target = normalizeForMatch(userText);
  if (!target) return null;
  try {
    const res = await rpc.getForkMessages(useChat.getState().activeTabId);
    const messages = Array.isArray(res.messages) ? res.messages : [];
    const exact = messages.filter((m) => normalizeForMatch(m.text) === target);
    if (exact.length > 0) return forkPointId(closestForkPoint(exact, timestamp) ?? exact[exact.length - 1]) ?? null;
    const contains = messages.filter((m) => {
      const text = normalizeForMatch(m.text);
      return text.includes(target) || target.includes(text);
    });
    return forkPointId(closestForkPoint(contains, timestamp) ?? contains[contains.length - 1]) ?? null;
  } catch {
    return null;
  }
}

function closestForkPoint(
  messages: rpc.ForkPoint[],
  timestamp?: number,
): rpc.ForkPoint | undefined {
  if (messages.length === 0) return undefined;
  if (typeof timestamp !== "number") return messages[messages.length - 1];
  return messages.reduce((best, cur) => {
    const bt = typeof best.timestamp === "number" ? best.timestamp : Date.parse(String(best.timestamp ?? ""));
    const ct = typeof cur.timestamp === "number" ? cur.timestamp : Date.parse(String(cur.timestamp ?? ""));
    if (!Number.isFinite(ct)) return best;
    if (!Number.isFinite(bt)) return cur;
    return Math.abs(ct - timestamp) < Math.abs(bt - timestamp) ? cur : best;
  });
}

function closestUiMessageByText(
  messages: UiMessage[],
  target: string,
  timestamp?: number,
): UiMessage | undefined {
  const candidates = messages.filter((m) => {
    const text = normalizeForMatch(joinText(m.blocks));
    return text === target || text.includes(target) || target.includes(text);
  });
  if (candidates.length === 0) return undefined;
  if (typeof timestamp !== "number") return candidates[candidates.length - 1];
  return candidates.reduce((best, cur) =>
    Math.abs(cur.timestamp - timestamp) < Math.abs(best.timestamp - timestamp) ? cur : best,
  );
}

function blockToString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    return v
      .map((x) => {
        if (x && typeof x === "object" && "text" in (x as Record<string, unknown>)) {
          return String((x as { text: unknown }).text ?? "");
        }
        return typeof x === "string" ? x : JSON.stringify(x);
      })
      .join("\n");
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.text === "string") return o.text;
    if (typeof o.content === "string") return o.content;
    return JSON.stringify(o);
  }
  return String(v);
}

/** Парсит AgentMessage.content в UI-блоки. Универсальный конвертор.
 *  Реальный формат pi:
 *    - text:     {type:"text", text:"…"}
 *    - thinking: {type:"thinking", thinking:"…", thinkingSignature:"…"}
 *    - toolCall: {type:"toolCall", id, name, arguments}
 *    - image:    {type:"image", data, mimeType}
 *  (role="toolResult" — отдельное сообщение, обрабатывается в upsertMessage.)
 */
function agentContentToBlocks(content: unknown): UiBlock[] {
  const blocks: UiBlock[] = [];
  if (typeof content === "string") {
    if (content) blocks.push({ kind: "text", text: content });
    return blocks;
  }
  if (!Array.isArray(content)) return blocks;
  for (const c of content) {
    if (!c || typeof c !== "object") continue;
    const obj = c as Record<string, unknown>;
    const t = obj.type as string | undefined;
    if (t === "text" && typeof obj.text === "string") {
      blocks.push({ kind: "text", text: obj.text });
    } else if (t === "thinking") {
      const txt =
        (typeof obj.thinking === "string" ? obj.thinking : "") ||
        (typeof obj.text === "string" ? obj.text : "");
      blocks.push({ kind: "thinking", text: txt });
    } else if (
      t === "tool_use" ||
      t === "toolUse" ||
      t === "tool_call" ||
      t === "toolCall"
    ) {
      blocks.push({
        kind: "tool",
        toolUseId: String(obj.id ?? obj.toolCallId ?? newId()),
        name: String(obj.name ?? obj.toolName ?? "tool"),
        input: obj.arguments ?? obj.args ?? obj.input,
        status: "running",
      });
    } else if (t === "tool_result" || t === "toolResult") {
      // Иногда result inline в content — поддержим, но это редкий случай.
      const id = String(obj.tool_use_id ?? obj.toolUseId ?? obj.toolCallId ?? "");
      const text = extractToolText(obj.content ?? obj.result);
      const images = extractToolImages(obj.content ?? obj.result);
      const isError = Boolean(obj.is_error ?? obj.isError);
      const details = obj.details;
      const existing = blocks.find(
        (b): b is UiBlockTool => b.kind === "tool" && b.toolUseId === id,
      );
      if (existing) {
        existing.output = text;
        existing.images = images.length > 0 ? images : existing.images;
        existing.details = details;
        existing.status = isError ? "error" : "done";
      } else {
        blocks.push({
          kind: "tool",
          toolUseId: id || newId(),
          name: "tool",
          output: text,
          images: images.length > 0 ? images : undefined,
          details,
          status: isError ? "error" : "done",
        });
      }
    } else if (t === "image") {
      blocks.push({
        kind: "image",
        mimeType: String(obj.mimeType ?? obj.media_type ?? "image/png"),
        data: String(obj.data ?? ""),
      });
    }
  }
  return blocks;
}

function isHiddenCwdChangeMessage(message: Record<string, unknown>): boolean {
  if (message.customType === "cwd-change" || message.display === false) return true;
  const content = message.content;
  if (typeof content === "string") {
    return /^\[Working directory changed to: .+\]$/.test(content.trim());
  }
  if (Array.isArray(content) && content.length === 1) {
    const item = content[0] as Record<string, unknown>;
    return item?.type === "text" && typeof item.text === "string" && /^\[Working directory changed to: .+\]$/.test(item.text.trim());
  }
  return false;
}

/** Извлечь изображения из tool result (`{content:[{type:"image",data,mimeType}]}`). */
function extractToolImages(value: unknown): UiBlockImage[] {
  if (!value || typeof value !== "object") return [];
  const o = value as Record<string, unknown>;
  if (!Array.isArray(o.content)) return [];
  const images: UiBlockImage[] = [];
  for (const c of o.content) {
    if (!c || typeof c !== "object") continue;
    const co = c as Record<string, unknown>;
    if (co.type === "image" && typeof co.data === "string" && typeof co.mimeType === "string") {
      images.push({ kind: "image", mimeType: co.mimeType, data: co.data });
    }
  }
  return images;
}

/** Извлечь текст из tool result (`{content:[{type:"text",text:"..."}]}`). */
function extractToolText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (Array.isArray(o.content)) {
      const texts: string[] = [];
      for (const c of o.content) {
        if (c && typeof c === "object") {
          const co = c as Record<string, unknown>;
          if (typeof co.text === "string") texts.push(co.text);
        }
      }
      if (texts.length > 0) return texts.join("\n");
    }
    if (typeof o.text === "string") return o.text;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function mergeToolDetails(current: unknown, next: unknown): unknown {
  if (current && next && typeof current === "object" && typeof next === "object" && !Array.isArray(current) && !Array.isArray(next)) {
    return { ...(current as Record<string, unknown>), ...(next as Record<string, unknown>) };
  }
  return next ?? current;
}

function extractToolDetails(value: unknown): unknown {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (record.details != null) return record.details;
  if (Array.isArray(record.todos)) return record;
  if (typeof record.text === "string") {
    try {
      const parsed = JSON.parse(record.text) as unknown;
      if (parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).todos)) return parsed;
    } catch {
      // ignore
    }
  }
  if (Array.isArray(record.content)) {
    for (const item of record.content) {
      if (!item || typeof item !== "object") continue;
      const text = (item as Record<string, unknown>).text;
      if (typeof text !== "string") continue;
      try {
        const parsed = JSON.parse(text) as unknown;
        if (parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).todos)) return parsed;
      } catch {
        // ignore
      }
    }
  }
  return value;
}

function isFastContextResult(value: unknown): value is import("@/rpc/bridge").FastContextResult {
  return Boolean(
    value &&
      typeof value === "object" &&
      Array.isArray((value as Record<string, unknown>).files),
  );
}

function extractFastContextResult(
  details: unknown,
  raw: unknown,
): import("@/rpc/bridge").FastContextResult | null {
  if (isFastContextResult(details)) return details;
  if (isFastContextResult(raw)) return raw;
  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    if (isFastContextResult(record.details)) return record.details;
  }
  return null;
}

function isFastFetchDetails(value: unknown): value is import("@/rpc/bridge").FastFetchToolDetails {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.url === "string" ||
    record.mode === "search" ||
    record.mode === "url" ||
    typeof record.status === "number" ||
    typeof record.contentType === "string" ||
    typeof record.bytes === "number"
  );
}

function extractFastFetchResult(
  details: unknown,
  text: string,
  raw: unknown,
): import("@/rpc/bridge").FastFetchResult | null {
  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    if (typeof record.text === "string") {
      return {
        text: record.text,
        details: isFastFetchDetails(record.details) ? record.details : undefined,
      };
    }
    if (isFastFetchDetails(record.details)) return { text, details: record.details };
  }
  if (isFastFetchDetails(details)) return { text, details };
  return text ? { text } : null;
}

function createSystemMessage(text: string): UiMessage {
  return {
    id: newId(),
    role: "assistant",
    blocks: [{ kind: "text", text }],
    streaming: false,
    timestamp: Date.now(),
  };
}

function ensurePendingAssistantAfterUser(
  set: (
    partial:
      | Partial<ChatState>
      | ((s: ChatState) => Partial<ChatState>),
  ) => void,
  userMessageId?: string,
) {
  set((s) => {
    const userIdx = userMessageId
      ? s.messages.findIndex((m) => m.id === userMessageId)
      : (() => {
          for (let i = s.messages.length - 1; i >= 0; i--) {
            if (s.messages[i].role === "user") return i;
          }
          return -1;
        })();
    if (userIdx === -1) return {};

    const existingAssistantAfterUser = s.messages.findIndex(
      (m, i) => i > userIdx && m.role === "assistant",
    );
    if (existingAssistantAfterUser !== -1) return {};

    const uiId = newId();
    return {
      messages: [
        ...s.messages,
        {
          id: uiId,
          role: "assistant",
          blocks: [],
          streaming: true,
          timestamp: Date.now(),
          pendingAssistant: true,
        },
      ],
      // Если это новый turn и ещё нет текущего assistant-сообщения, первый
      // реальный assistant-event без piId переиспользует placeholder. Если же
      // пользователь отправил steer во время уже активного стрима, не крадём
      // currentAssistantId у предыдущего streaming assistant-message.
      currentAssistantId: s.currentAssistantId ?? uiId,
    };
  });
}

function formatTokenCount(value: number): string {
  return Math.round(value).toLocaleString("ru-RU");
}

function formatCompactionMessage(result: unknown): { key: string; text: string } {
  const r = result && typeof result === "object" ? (result as Record<string, unknown>) : {};
  const before = typeof r.tokensBefore === "number" ? r.tokensBefore : undefined;
  const after = typeof r.tokensAfter === "number" ? r.tokensAfter : undefined;
  let text = "Контекст сессии сжат.";
  if (before !== undefined && after !== undefined && before > 0) {
    const saved = Math.max(0, before - after);
    const percent = Math.round((saved / before) * 100);
    text = `Контекст сессии сжат: ${formatTokenCount(before)} → ${formatTokenCount(after)} токенов (−${formatTokenCount(saved)}, ${percent}%).`;
  } else if (before !== undefined) {
    text = `Контекст сессии сжат. До сжатия: ~${formatTokenCount(before)} токенов.`;
  }
  const keyParts = [before ?? "?", after ?? "?", String(r.firstKeptEntryId ?? "")];
  if (typeof r.summary === "string") keyParts.push(String(r.summary.length));
  return { key: keyParts.join(":"), text };
}


function applyScopedPartial(
  tabId: string,
  partialOrFn:
    | Partial<ChatState>
    | ((s: ChatState) => Partial<ChatState>),
  set: (
    partial:
      | Partial<ChatState>
      | ((s: ChatState) => Partial<ChatState>),
  ) => void,
  get: () => ChatState,
): void {
  const current = get();
  const currentTab = current.tabs.get(tabId) ?? createDefaultSessionTab(tabId);
  const scopedState = { ...current, ...tabProjection(currentTab), activeTabId: tabId } as ChatState;
  const partial = typeof partialOrFn === "function" ? partialOrFn(scopedState) : partialOrFn;
  const tabPatch = pickTabPatch(partial);
  const globalPatch: Partial<ChatState> = {};
  for (const [key, value] of Object.entries(partial) as Array<[keyof ChatState, unknown]>) {
    if (!TAB_FIELD_KEYS.has(key as keyof SessionTabState)) {
      (globalPatch as Record<string, unknown>)[key as string] = value;
    }
  }
  set((state) => {
    const existing = state.tabs.get(tabId) ?? createDefaultSessionTab(tabId);
    const nextTab = { ...existing, ...tabPatch, tabId };
    const tabs = new Map(state.tabs).set(tabId, nextTab);
    const tabOrder = state.tabOrder.includes(tabId) ? state.tabOrder : [...state.tabOrder, tabId];
    const next: Partial<ChatState> = { ...globalPatch, tabs, tabOrder };
    if (state.activeTabId === tabId) {
      Object.assign(next, tabProjection(nextTab));
    }
    return next;
  });
}

function makeScopedSet(
  tabId: string,
  set: (
    partial:
      | Partial<ChatState>
      | ((s: ChatState) => Partial<ChatState>),
  ) => void,
  get: () => ChatState,
) {
  return (partial: Partial<ChatState> | ((s: ChatState) => Partial<ChatState>)) =>
    applyScopedPartial(tabId, partial, set, get);
}

function makeScopedGet(tabId: string, get: () => ChatState): () => ChatState {
  return () => {
    const state = get();
    const tab = state.tabs.get(tabId);
    if (!tab) return state;
    return { ...state, ...tabProjection(tab), activeTabId: tabId } as ChatState;
  };
}

export const useChat = create<ChatState>((rawSet, get) => {
  const set = (
    partial:
      | Partial<ChatState>
      | ((s: ChatState) => Partial<ChatState>),
  ) => {
    rawSet((state) => {
      const resolved = typeof partial === "function" ? partial(state) : partial;
      if (!resolved || typeof resolved !== "object") return resolved;
      if (resolved.tabs !== undefined || resolved.tabOrder !== undefined || resolved.activeTabId !== undefined) {
        return resolved;
      }
      const activeTabId = state.activeTabId;
      if (!activeTabId) return resolved;
      const tabPatch = pickTabPatch(resolved);
      if (Object.keys(tabPatch).length === 0) return resolved;
      const existing = state.tabs.get(activeTabId) ?? createDefaultSessionTab(activeTabId);
      const nextTab = { ...existing, ...tabPatch, tabId: activeTabId };
      return {
        ...resolved,
        tabs: new Map(resolved.tabs ?? state.tabs).set(activeTabId, nextTab),
        tabOrder: resolved.tabOrder ?? (state.tabOrder.includes(activeTabId) ? state.tabOrder : [...state.tabOrder, activeTabId]),
      };
    });
  };

  return ({
  generation: 0,
  rpcRunning: false,
  mcpLoading: false,
  piPath: null,
  cliPathOverride: localStorage.getItem(STORAGE_KEY_CLI),
  cwd:
    localStorage.getItem(STORAGE_KEY_CWD) ||
    (typeof window !== "undefined" ? "/" : "/"),
  home: null,
  planMode: readPlanMode(),
  planFilePath: null,
  planLoading: false,
  attachedSkills: [],
  switching: false,
  agentState: null,
  retryStatus: { active: false, attempt: 0 },
  availableModels: [],
  pendingMessageCount: 0,
  sessionStats: null,
  uiToPiId: {},
  messages: [],
  currentAssistantId: null,
  messageIdMap: new Map(),
  streamingBehavior: "steer",
  errorBanner: null,
  stderrBuffer: [],
  composerInjection: null,
  composerValue: "",
  composerHistory: [],
  composerHistoryIndex: -1,
  composerAttachments: [],
  pendingUserAction: null,
  forkBanner: null,
  fastContextStatus: null,
  fastContextResults: null,
  fastContextQuery: null,
  fastContextError: null,
  fastContextRunId: 0,
  fastFetchStatus: null,
  fastFetchResult: null,
  fastFetchQuery: null,
  fastFetchError: null,
  fastFetchRunId: 0,
  lastCompactionMessageKey: null,

  tabs: new Map(),
  tabOrder: [],
  activeTabId: null,

  ensureTab(tabId, initial) {
    closedTabIds.delete(tabId);
    set((s) => {
      if (s.tabs.has(tabId)) {
        if (!initial) return {};
        const existing = s.tabs.get(tabId)!;
        const nextTab = { ...existing, ...initial, tabId };
        const tabs = new Map(s.tabs).set(tabId, nextTab);
        const next: Partial<ChatState> = { tabs };
        if (s.activeTabId === tabId) Object.assign(next, tabProjection(nextTab));
        return next;
      }
      const tab = createDefaultSessionTab(tabId, initial);
      return {
        tabs: new Map(s.tabs).set(tabId, tab),
        tabOrder: s.tabOrder.includes(tabId) ? s.tabOrder : [...s.tabOrder, tabId],
        activeTabId: s.activeTabId ?? tabId,
        ...(s.activeTabId ? {} : tabProjection(tab)),
      };
    });
  },

  syncFromTab(tabId) {
    const tab = get().tabs.get(tabId);
    if (!tab) return;
    set({ ...tabProjection(tab), activeTabId: tabId });
  },

  updateTab(tabId, patch) {
    set((s) => {
      const existing = s.tabs.get(tabId) ?? createDefaultSessionTab(tabId);
      const nextTab = { ...existing, ...patch, tabId };
      const tabs = new Map(s.tabs).set(tabId, nextTab);
      const tabOrder = s.tabOrder.includes(tabId) ? s.tabOrder : [...s.tabOrder, tabId];
      const next: Partial<ChatState> = { tabs, tabOrder };
      if (s.activeTabId === tabId) Object.assign(next, tabProjection(nextTab));
      return next;
    });
  },

  async activateTab(tabId) {
    if (!get().tabs.has(tabId)) return;
    try {
      if (get().rpcRunning) await rpc.switchActiveSession(tabId);
    } catch (e) {
      get().setError((e as Error).message);
      return;
    }
    const tab = get().tabs.get(tabId);
    if (!tab) return;
    const nextTab = { ...tab, unseenAssistantCount: 0 };
    set((s) => ({
      tabs: new Map(s.tabs).set(tabId, nextTab),
      activeTabId: tabId,
      ...tabProjection(nextTab),
    }));
    rememberOpenTabsSnapshot(get());
  },

  async createSessionTab(name, options) {
    try {
      const { sessionId } = await rpc.createSession({
        cwd: get().cwd,
        mode: options?.mode ?? "empty",
        sourceSessionId: options?.sourceSessionId ?? get().activeTabId,
        sessionPath: options?.sessionPath ?? undefined,
      });
      closedTabIds.delete(sessionId);
      const sourceId = options?.sourceSessionId ?? get().activeTabId;
      const sourceSkills = options?.mode === "copy" && sourceId ? (get().tabs.get(sourceId)?.attachedSkills ?? get().attachedSkills) : [];
      const initial: Partial<SessionTabState> = { sessionName: name ?? null };
      if (options?.mode === "copy") {
        initial.attachedSkills = sourceSkills;
        writeAttachedSkills(sessionId, sourceSkills, false);
      } else if (!options?.sessionPath) {
        // Brand-new empty sessions start with no pinned skills.
        initial.attachedSkills = [];
        writeAttachedSkills(sessionId, [], false);
      } else {
        // Opening an existing session file — restore skills from file-based key.
        initial.attachedSkills = readAttachedSkillsFromFile(options.sessionPath);
        writeAttachedSkills(sessionId, initial.attachedSkills, false);
      }
      const tab = createDefaultSessionTab(sessionId, initial);
      set((s) => ({
        tabs: new Map(s.tabs).set(sessionId, tab),
        tabOrder: s.tabOrder.includes(sessionId) ? s.tabOrder : [...s.tabOrder, sessionId],
      }));
      await get().activateTab(sessionId);
      await get().refreshState().catch(() => undefined);
      // After refreshState provides sessionFile, migrate from sessionId key to file key.
      try {
        const st = get();
        const sessionFile = st.agentState?.sessionFile;
        if (sessionFile) {
          migrateAttachedSkillsKey(sessionId, sessionFile);
        }
      } catch {
        // non-critical
      }
      await get().reloadHistory().catch(() => undefined);
      await get().refreshSessionStats().catch(() => undefined);
      rememberOpenTabsSnapshot(get());
      notifySessionsChanged();
      return sessionId;
    } catch (e) {
      get().setError((e as Error).message);
      return null;
    }
  },

  async createForkTab() {
    const source = get().activeTabId;
    if (!source) return get().createSessionTab(undefined, { mode: "copy" });
    const sourceTab = get().tabs.get(source);
    const baseName = sourceTab?.sessionName?.trim() || (source === DEFAULT_TAB_ID ? "main" : source);
    return get().createSessionTab(`${baseName} fork`, { mode: "copy", sourceSessionId: source });
  },

  async openSessionTab(file, name, activate = true) {
    const existing = Array.from(get().tabs.values()).find((tab) => tab.agentState?.sessionFile === file);
    if (existing) {
      if (activate) await get().activateTab(existing.tabId);
      return existing.tabId;
    }
    const previousActive = get().activeTabId;
    const tabId = await get().createSessionTab(name ?? undefined, { mode: "empty", sessionPath: file });
    if (tabId && !activate && previousActive && previousActive !== tabId) {
      await get().activateTab(previousActive).catch(() => undefined);
    }
    return tabId;
  },

  async closeSessionTab(tabId) {
    const st = get();
    if (st.tabOrder.length <= 1) {
      get().setError("Нельзя закрыть последнюю сессию");
      return;
    }
    const idx = st.tabOrder.indexOf(tabId);
    if (idx === -1) return;

    const nextOrder = st.tabOrder.filter((id) => id !== tabId);
    const nextTabs = new Map(st.tabs);
    nextTabs.delete(tabId);
    const nextActive = st.activeTabId === tabId ? nextOrder[Math.max(0, idx - 1)] ?? nextOrder[0] ?? null : st.activeTabId;

    try {
      if (st.rpcRunning) await rpc.closeSession(tabId);
    } catch (e) {
      const message = (e as Error).message;
      // Если tab уже был удалён на backend, всё равно убираем локальный zombie-tab.
      if (!message.includes("Session not found")) {
        get().setError(message);
        return;
      }
    }

    closedTabIds.add(tabId);
    set({ tabs: nextTabs, tabOrder: nextOrder, activeTabId: nextActive });
    if (nextActive) await get().activateTab(nextActive);
    rememberOpenTabsSnapshot(get());
  },

  moveTab(fromIndex, toIndex) {
    set((s) => {
      const order = [...s.tabOrder];
      if (fromIndex < 0 || fromIndex >= order.length || toIndex < 0 || toIndex >= order.length) return {};
      const [item] = order.splice(fromIndex, 1);
      order.splice(toIndex, 0, item);
      return { tabOrder: order };
    });
    rememberOpenTabsSnapshot(get());
  },

  moveTabById(tabId, beforeTabId) {
    set((s) => {
      if (!s.tabOrder.includes(tabId) || tabId === beforeTabId) return {};
      const order = s.tabOrder.filter((id) => id !== tabId);
      const insertAt = beforeTabId ? order.indexOf(beforeTabId) : -1;
      if (insertAt >= 0) order.splice(insertAt, 0, tabId);
      else order.push(tabId);
      return { tabOrder: order };
    });
    rememberOpenTabsSnapshot(get());
  },

  async init() {
    if (initOnce) return;
    initOnce = true;
    rpc.onEvent((event) => {
      const explicitSid = typeof event.sessionId === "string" ? event.sessionId : null;
      const sid = explicitSid ?? get().activeTabId;
      if (!sid) {
        handleAgentEvent(event, set, get);
        return;
      }
      if (explicitSid && closedTabIds.has(explicitSid) && !get().tabs.has(explicitSid)) {
        return;
      }
      get().ensureTab(sid);
      const wasInactive = sid !== get().activeTabId;
      handleAgentEvent(event, makeScopedSet(sid, set, get), makeScopedGet(sid, get));
      if (wasInactive && (event.type === "message_end" || event.type === "agent_end" || event.type === "extension_error")) {
        const tab = get().tabs.get(sid);
        if (tab) get().updateTab(sid, { unseenAssistantCount: tab.unseenAssistantCount + 1 });
      }
    });
    rpc.onClosed((reason) => {
      set({ rpcRunning: false });
      if (reason !== "rpc_stop") {
        // Приклеиваем последние осмысленные stderr-строки —
        // это критично, чтобы видеть ПОЧЕМУ pi упал (нет ключа,
        // unknown provider, network и т.п.).
        const tail = get()
          .stderrBuffer.filter((s) => s.trim().length > 0)
          .slice(-3)
          .join(" | ");
        const detail = tail ? ` — ${tail}` : "";
        get().setError(`pi завершился: ${reason}${detail}`);
      }
    });
    rpc.onStderr((line) => {
      const buf = [...get().stderrBuffer, line].slice(-200);
      set({ stderrBuffer: buf });
    });
  },

  async startRpc(opts) {
    if (activeStartPromise) return activeStartPromise;
    const run = (async () => {
      const { cliPathOverride, cwd } = get();
      try {
        const startupRemembered = opts?.sessionFile ? { files: [] as string[] } : readRememberedOpenTabs(cwd);
        const legacyRememberedSessionFile = await invoke<string | null>("read_last_session_file", { cwd }).catch(() => null);
        const rememberedSessionFile =
          opts?.sessionFile ??
          startupRemembered.activeFile ??
          startupRemembered.files[0] ??
          legacyRememberedSessionFile;
        // ВАЖНО: НЕ передаём provider/model как CLI-флаги.
        // У pi есть extension-провайдеры (devin, omniroute и т.п.),
        // которые инициализируются лениво и НЕ известны на этапе argv-парсинга
        // — pi падает с "Unknown provider". Поэтому стартуем с дефолтной
        // моделью из ~/.pi/agent/settings.json, а нужную модель применяем
        // через RPC `set_model` после того, как pi полностью поднялся
        // (включая extension-провайдеры).
        // Определяем наличие активных MCP-серверов ДО старта индикатора загрузки.
        try {
          const mcpCfg = await invoke<{ servers: { disabled: boolean }[] }>("read_mcp_config");
          mcpHasServers = mcpCfg.servers.some((s) => !s.disabled);
        } catch {
          mcpHasServers = null;
        }
        // Virtual display must exist before pi starts: GUI apps launched by the agent
        // inherit DISPLAY=:99 and appear in the isolated environment instead of the user's desktop.
        await useVirtualDisplay.getState().start();
        const res = await rpc.rpcStart({
          cliPath: cliPathOverride ?? null,
          cwd,
          provider: undefined,
          model: undefined,
          sessionFile: rememberedSessionFile ?? undefined,
          env: {
            DISPLAY: ":99",
            GDK_BACKEND: "x11",
            QT_QPA_PLATFORM: "xcb",
            ELECTRON_OZONE_PLATFORM_HINT: "x11",
            NO_AT_BRIDGE: "1",
            PI_DEEP_RESEARCH_MODE: useUiPrefs.getState().deepResearchMode,
          },
        });
        setMcpLoading(set, true);
        closedTabIds.clear();
        set({
          rpcRunning: true,
          generation: res.generation,
          piPath: res.piPath,
          errorBanner: null,
          stderrBuffer: [],
          sessionStats: null,
          messages: [],
          currentAssistantId: null,
          messageIdMap: new Map(),
          tabs: new Map(),
          tabOrder: [],
          activeTabId: null,
        });
        // даем pi пару миллисекунд на инициализацию stdout
        await new Promise((r) => setTimeout(r, 50));
        await get().refreshState();
        await get().reloadHistory().catch(() => undefined);
        await get().refreshSessionStats().catch(() => undefined);
        const activeFile = get().agentState?.sessionFile;
        const rememberedOpenTabs = startupRemembered.files
          .filter((file) => file && file !== activeFile);
        for (const file of rememberedOpenTabs) {
          await get().openSessionTab(file, null, false).catch(() => null);
        }
        const orderedFiles = startupRemembered.files;
        if (orderedFiles.length > 0) {
          const tabsByFile = new Map(
            Array.from(get().tabs.values())
              .map((tab) => [tab.agentState?.sessionFile, tab.tabId] as const)
              .filter((entry): entry is readonly [string, string] => Boolean(entry[0])),
          );
          const orderedTabIds = orderedFiles
            .map((file) => tabsByFile.get(file))
            .filter((tabId): tabId is string => Boolean(tabId));
          const leftovers = get().tabOrder.filter((tabId) => !orderedTabIds.includes(tabId));
          set({ tabOrder: [...orderedTabIds, ...leftovers] });
        }
        const targetActiveFile = startupRemembered.activeFile || activeFile;
        if (get().activeTabId && targetActiveFile) {
          const activeTab = Array.from(get().tabs.values()).find((tab) => tab.agentState?.sessionFile === targetActiveFile);
          if (activeTab && get().activeTabId !== activeTab.tabId) {
            await get().activateTab(activeTab.tabId).catch(() => undefined);
          }
        }
        rememberOpenTabsSnapshot(get());
        void get().loadAvailableModels();

        // Применяем сохранённую модель ПОСЛЕ старта.
        // Если safe=true — пропускаем (использовать дефолт pi).
        if (!opts?.safe) {
          const savedProvider = localStorage.getItem(STORAGE_KEY_PROVIDER);
          const savedModel = localStorage.getItem(STORAGE_KEY_MODEL);
          if (savedProvider && savedModel) {
            void (async () => {
              await new Promise((r) => setTimeout(r, 1500));
              try {
                await rpc.setModel(savedProvider, savedModel, get().activeTabId);
                await get().refreshState();
              } catch (e) {
                localStorage.removeItem(STORAGE_KEY_PROVIDER);
                localStorage.removeItem(STORAGE_KEY_MODEL);
                get().setError(
                  `Не удалось активировать модель ${savedProvider}/${savedModel}: ${(e as Error).message}. Использую дефолтную.`,
                );
              }
            })();
          }
        }
      } catch (e) {
        get().setError((e as Error).message);
        set({ rpcRunning: false });
        setMcpLoading(set, false);
      } finally {
        activeStartPromise = null;
      }
    })();
    activeStartPromise = run;
    return run;
  },

  async stopRpc() {
    clearScheduledSessionStatsRefresh();
    await rpc.rpcStop().catch(() => undefined);
    setMcpLoading(set, false);
    closedTabIds.clear();
    set({ rpcRunning: false, agentState: null, tabs: new Map(), tabOrder: [], activeTabId: null });
  },

  async restartRpc(opts) {
    clearScheduledSessionStatsRefresh();
    // Полный перезапуск: stop → пауза → start.
    // Если safe=true — стираем сохранённые provider/model из localStorage,
    // чтобы pi не использовал сломанную модель и подхватил дефолт.
    if (opts?.safe) {
      localStorage.removeItem(STORAGE_KEY_PROVIDER);
      localStorage.removeItem(STORAGE_KEY_MODEL);
    }
    set({ errorBanner: null });
    try {
      await rpc.rpcStop().catch(() => undefined);
    } catch {
      // ignore
    }
    closedTabIds.clear();
    set({ rpcRunning: false, agentState: null, tabs: new Map(), tabOrder: [], activeTabId: null });
    // Небольшая пауза, чтобы pi-процесс успел корректно завершиться
    await new Promise((r) => setTimeout(r, 200));
    await get().startRpc(opts?.safe ? { safe: true } : undefined);
  },

  async send(message, images, sendOpts) {
    const { agentState, streamingBehavior, planMode, planFilePath, attachedSkills } = get();
    const trimmed = message.trim();
    const files = sendOpts?.files;
    if (!trimmed && (!images || images.length === 0) && (!files || files.length === 0)) return;

    // 1) plan mode: префикс с инструкциями для модели.
    let body = trimmed;
    if (planMode) {
      const planPath = planFilePath || "<plan.md>";
      const prefix =
        `[PLAN MODE] Не модифицируй файлы кроме \`${planPath}\`. ` +
        `Не запускай разрушительные команды (rm, mv, git push, drop и т.п.). ` +
        `Сначала исследуй кодовую базу через read-only инструменты (read_file, grep, list_dir). ` +
        `Веди и обновляй план в \`${planPath}\` (markdown, секция "## Шаги" или "## Tasks" с чек-листами, ссылки на файлы). ` +
        `Если доступен todo tool/todo_list, обязательно создай и обновляй видимый список задач. ` +
        `Жди явного «Реализуй» от пользователя — не приступай к изменениям сейчас.\n\n`;
      body = prefix + body;
    }

    // 2) attached skills: добавляем хвостом
    if (attachedSkills.length > 0) {
      const tail = attachedSkills.map((s) => `/skill:${s}`).join(" ");
      body = body ? `${body}\n\n${tail}` : tail;
    }

    // 3) file attachments: pi RPC не поддерживает файлы, поэтому
    //    встраиваем содержимое текстовых файлов в тело сообщения как markdown.
    //    Бинарные файлы (картинки, PDF, ZIP и т.п.) — просто помечаем.
    const TEXT_MIME_PREFIXES = ["text/", "application/json", "application/xml",
      "application/x-sh", "application/javascript", "application/x-python",
      "application/x-rust", "application/x-yaml", "application/x-toml",
      "application/x-httpd-php", "application/x-perl", "application/x-ruby",
    ];
    const TEXT_EXTS = [".md", ".json", ".xml", ".yaml", ".yml", ".toml", ".ini", ".cfg",
      ".env", ".gitignore", ".dockerfile", ".lock", ".rs", ".py", ".js", ".ts",
      ".tsx", ".jsx", ".css", ".scss", ".html", ".sh", ".bash", ".zsh",
      ".fish", ".c", ".cpp", ".h", ".hpp", ".go", ".java", ".rb", ".php",
      ".pl", ".lua", ".sql", ".r", ".swift", ".kt", ".gradle", ".svelte",
      ".vue", ".txt", ".log", ".conf",
    ];
    const isTextFile = (f: import("@/rpc/types").FileContent): boolean => {
      if (f.mimeType.startsWith("text/")) return true;
      if (TEXT_MIME_PREFIXES.some(p => f.mimeType.startsWith(p))) return true;
      const ext = "." + f.name.split(".").pop()?.toLowerCase();
      if (TEXT_EXTS.some(e => ext.endsWith(e))) return true;
      return false;
    };

    const optimisticId = newId();
    const optimisticBlocks = createOptimisticUserBlocks(trimmed, images, files);
    set((s) => ({
      messages: [
        ...s.messages,
        {
          id: optimisticId,
          role: "user",
          blocks: optimisticBlocks,
          streaming: false,
          timestamp: Date.now(),
          optimistic: true,
          localEcho: true,
        },
      ],
    }));

    if (files && files.length > 0) {
      for (const f of files) {
        if (isTextFile(f)) {
          try {
            const binary = atob(f.data);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const text = new TextDecoder().decode(bytes);
            body += `\n\n### Файл: ${f.name}\n\`\`\`\n${text}\n\`\`\``;
          } catch {
            body += `\n\n[Файл ${f.name} — не удалось прочитать как текст]`;
          }
        } else {
          body += `\n\n[Файл: ${f.name} (${f.mimeType}) — бинарный файл. Отправьте его содержимое отдельно или укажите путь до файла]`;
        }
      }
    }

    try {
      const opts: { images?: import("@/rpc/types").ImageContent[]; streamingBehavior?: StreamingBehavior } = {};
      if (sendOpts?.streamingBehavior) {
        opts.streamingBehavior = sendOpts.streamingBehavior;
      } else if (agentState?.isStreaming) {
        opts.streamingBehavior = streamingBehavior;
      }
      if (images && images.length > 0) opts.images = images;
      await rpc.sendPrompt(body, { ...(Object.keys(opts).length > 0 ? opts : {}), sessionId: get().activeTabId });
      ensurePendingAssistantAfterUser(set, optimisticId);
    } catch (e) {
      const messageText = (e as Error).message;
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === optimisticId
            ? { ...m, optimistic: false, localEcho: false, error: messageText }
            : m,
        ),
      }));
      get().setError(messageText);
    }
  },

  async abortStreaming() {
    try {
      await rpc.abort(get().activeTabId);
    } catch (e) {
      get().setError((e as Error).message);
    }
  },

  clearMessages() {
    set({
      messages: [],
      currentAssistantId: null,
      messageIdMap: new Map(),
    });
  },

  setCwd(cwd) {
    localStorage.setItem(STORAGE_KEY_CWD, cwd);
    set({ cwd });
  },

  setHome(home) {
    set({ home });
  },

  setCliPathOverride(p) {
    if (p && p.trim()) {
      localStorage.setItem(STORAGE_KEY_CLI, p.trim());
      set({ cliPathOverride: p.trim() });
    } else {
      localStorage.removeItem(STORAGE_KEY_CLI);
      set({ cliPathOverride: null });
    }
  },

  setStreamingBehavior(b) {
    set({ streamingBehavior: b });
  },

  async setAutoRetry(enabled) {
    try {
      await rpc.setAutoRetry(enabled, get().activeTabId);
      await get().refreshState();
    } catch (e) {
      get().setError((e as Error).message);
    }
  },

  async abortRetry() {
    try {
      await rpc.abortRetry(get().activeTabId);
      set((s) => ({
        retryStatus: { ...s.retryStatus, active: false, finalError: "Retry cancelled" },
        agentState: s.agentState ? { ...s.agentState, isRetrying: false, retryAttempt: 0 } : s.agentState,
      }));
      await get().refreshState();
    } catch (e) {
      get().setError((e as Error).message);
    }
  },

  async setThinking(level) {
    try {
      await rpc.setThinkingLevel(level, get().activeTabId);
      await get().refreshState();
    } catch (e) {
      get().setError((e as Error).message);
    }
  },

  async switchModel(provider, modelId) {
    try {
      await rpc.setModel(provider, modelId, get().activeTabId);
      localStorage.setItem(STORAGE_KEY_PROVIDER, provider);
      localStorage.setItem(STORAGE_KEY_MODEL, modelId);
      await get().refreshState();
    } catch (e) {
      get().setError((e as Error).message);
    }
  },

  async loadAvailableModels() {
    try {
      const res = await rpc.getAvailableModels();
      const list = Array.isArray(res)
        ? res
        : (res as { models?: Model[] }).models ?? [];
      set({ availableModels: list });
    } catch {
      // не фатально
    }
  },

  async refreshState() {
    try {
      const s = await rpc.getState(get().activeTabId);
      const tabId = s.sessionId || get().activeTabId || DEFAULT_TAB_ID;
      const currentSkills = get().tabs.get(tabId)?.attachedSkills;
      const attachedSkills = reconcileAttachedSkillsForSession(tabId, s.sessionFile, currentSkills);
      get().ensureTab(tabId, {
        agentState: s,
        pendingMessageCount: s.pendingMessageCount ?? 0,
        sessionName: s.sessionName ?? null,
        attachedSkills,
      });
      if (!get().activeTabId || get().activeTabId === tabId) {
        get().updateTab(tabId, {
          agentState: s,
          pendingMessageCount: s.pendingMessageCount ?? 0,
          sessionName: s.sessionName ?? null,
          attachedSkills,
        });
        get().syncFromTab(tabId);
      }
    } catch {
      // RPC может ещё не быть готов
    }
  },

  async reloadHistory() {
    try {
      const res = await rpc.getMessages(get().activeTabId);
      const messages = Array.isArray(res.messages) ? res.messages : [];
      const ui: UiMessage[] = [];
      const idMap = new Map<string, string>();
      const uiToPi: Record<string, string> = {};
      for (const raw of messages) {
        const m = raw as Record<string, unknown>;
        if (isHiddenCwdChangeMessage(m)) continue;
        const rawRole = String(m.role ?? "assistant");
        // toolResult — не отдельное сообщение, мерджим output в предыдущий toolCall
        if (rawRole === "toolResult") {
          const toolCallId = String(m.toolCallId ?? "");
          if (!toolCallId) continue;
          const text = extractToolText(m.content);
          const images = extractToolImages(m.content);
          const isError = Boolean(m.isError);
          for (let i = ui.length - 1; i >= 0; i--) {
            const um = ui[i];
            const target = um.blocks.find(
              (b): b is UiBlockTool => b.kind === "tool" && b.toolUseId === toolCallId,
            );
            if (target) {
              target.output = text;
              target.images = images.length > 0 ? images : target.images;
              target.details = m.details;
              target.status = isError ? "error" : "done";
              if (!target.name || target.name === "tool") {
                target.name = String(m.toolName ?? target.name);
              }
              break;
            }
          }
          continue;
        }
        const role = (rawRole as UiMessage["role"]) || "assistant";
        const blocks = agentContentToBlocks(m.content);
        if (blocks.length === 0) continue;
        // tool-блоки в истории уже завершены — статус будет проставлен toolResult-ом ниже
        for (const b of blocks) if (b.kind === "tool" && b.status === "running") b.status = "done";
        const uiId = newId();
        const piId = extractPiMessageId(m);
        if (piId) {
          idMap.set(piId, uiId);
          uiToPi[uiId] = piId;
        }
        ui.push({
          id: uiId,
          role,
          blocks,
          streaming: false,
          timestamp:
            typeof m.timestamp === "number"
              ? (m.timestamp as number)
              : Date.now(),
        });
      }
      set((s) => {
        // reloadHistory() отражает только persisted историю pi. Steering/follow-up
        // prompt, отправленный во время streaming, может быть принят/queued, но ещё
        // не попасть в get_messages(). Не удаляем локальные optimistic echo — иначе
        // второй prompt визуально "пропадает" сразу после фонового refresh-а.
        const preservedLocalEchoes = s.messages.filter((m) => {
          if (m.role !== "user" || !(m.localEcho || m.optimistic)) return false;
          const localText = normalizeForMatch(joinText(m.blocks));
          return !ui.some((hist) => {
            if (hist.role !== "user") return false;
            const histText = normalizeForMatch(joinText(hist.blocks));
            return (
              histText.includes(localText) ||
              localText.includes(histText) ||
              sameBlocks(hist.blocks, m.blocks)
            );
          });
        });
        const baseMessages = [...ui, ...preservedLocalEchoes];
        const hasVisibleAssistantAfterLastUser = (() => {
          const lastUserIdx = baseMessages.reduce((idx, m, i) => (m.role === "user" ? i : idx), -1);
          return (
            lastUserIdx !== -1 &&
            baseMessages.some((m, i) => i > lastUserIdx && m.role === "assistant")
          );
        })();
        const preservedPendingAssistants = hasVisibleAssistantAfterLastUser
          ? []
          : s.messages.filter((m) => m.role === "assistant" && m.pendingAssistant);
        const nextMessages = [...baseMessages, ...preservedPendingAssistants];
        const currentStillExists = s.currentAssistantId
          ? nextMessages.some((m) => m.id === s.currentAssistantId)
          : false;
        return {
          messages: nextMessages,
          messageIdMap: idMap,
          uiToPiId: uiToPi,
          currentAssistantId: currentStillExists
            ? s.currentAssistantId
            : preservedPendingAssistants[preservedPendingAssistants.length - 1]?.id ?? null,
        };
      });
    } catch {
      // ignore
    }
  },

  async newSession() {
    if (get().switching) return;
    clearScheduledSessionStatsRefresh();
    set({ switching: true });
    try {
      await rpc.newSession(undefined, get().activeTabId);
      await get().refreshState().catch(() => undefined);
      rememberOpenTabsSnapshot(get());
      get().clearMessages();
      await get().reloadHistory().catch(() => undefined);
      await get().refreshSessionStats().catch(() => undefined);
      if (get().planMode) {
        await get().loadPlan().catch(() => undefined);
      }
    } catch (e) {
      get().setError((e as Error).message);
    } finally {
      set({ switching: false });
    }
  },

  async switchSession(file) {
    // Защита от двойных кликов:
    // 1) уже идёт переключение → игнор
    // 2) клик по уже активной сессии → игнор (иначе pi бессмысленно
    //    прогонит полный MCP cleanup+reload цикл — `session_before_switch` +
    //    `session_switch` events).
    const st = get();
    if (st.agentState?.sessionFile === file) return;
    if (activeSwitch) {
      if (activeSwitch.file === file) return activeSwitch.promise;
      return;
    }

    const run = (async () => {
      set({ switching: true });
      try {
        debugMcp("switchSession:start", { file });
        clearScheduledSessionStatsRefresh();
        // Мгновенно очищаем сообщения ДО отправки switch — пользователь
        // видит пустую сессию сразу, не ожидая завершения RPC.
        get().clearMessages();
        set({ sessionStats: null });
        // pi на switch_session эмитит session_before_switch (MCP cleanup) и
        // session_switch (MCP reload). Это нормальное поведение pi — мы не
        // вызываем этот RPC дважды и не делаем ничего, что добавило бы
        // лишних циклов.
        await rpc.switchSession(file, get().activeTabId);
        debugMcp("switchSession:after rpc.switchSession", { file });
        await get().refreshState().catch(() => undefined);
        debugMcp("switchSession:after refreshState", { file, sessionFile: get().agentState?.sessionFile });
        rememberOpenTabsSnapshot(get());
        await get().reloadHistory().catch(() => undefined);
        await get().refreshSessionStats().catch(() => undefined);
        debugMcp("switchSession:after reloadHistory", { file });
        if (get().planMode) {
          await get().loadPlan().catch(() => undefined);
          debugMcp("switchSession:after loadPlan", { file });
        }
      } catch (e) {
        get().setError((e as Error).message);
      } finally {
        set({ switching: false });
        activeSwitch = null;
        // Принудительно снимаем mcpLoading после завершения switch.
        setMcpLoading(set, false);
      }
    })();
    activeSwitch = { file, promise: run };
    return run;
  },

  async changeCwd(next) {
    if (!next || next === get().cwd) return;
    set({ switching: true });
    try {
      get().setCwd(next);
      // полностью перезапускаем pi с новой cwd, иначе модель не "видит" смену.
      await rpc.rpcStop().catch(() => undefined);
      set({ rpcRunning: false, agentState: null });
      await new Promise((r) => setTimeout(r, 150));
      await get().startRpc();
    } catch (e) {
      get().setError((e as Error).message);
    } finally {
      set({ switching: false });
    }
  },

  async runSlashCommand(command, arg = "") {
    try {
      if (command === "/pwd") {
        const result = await rpc.pwd(get().activeTabId);
        set((state) => ({ messages: [...state.messages, createSystemMessage(`pwd\n\n${result.cwd}`)] }));
        return;
      }
      if (command === "/ls") {
        const result = await rpc.ls(arg.trim() || undefined, get().activeTabId);
        set((state) => ({
          messages: [...state.messages, createSystemMessage(`${result.displayPath}:\n\n${result.entries}`)],
        }));
        return;
      }
      if (command === "/cd") {
        const result = await rpc.cd(arg.trim(), get().activeTabId);
        get().setCwd(result.cwd);
        set((state) => ({
          agentState: state.agentState ? { ...state.agentState, cwd: result.cwd } : state.agentState,
        }));
        await get().refreshState().catch(() => undefined);
        set((state) => ({
          messages: [...state.messages, createSystemMessage(`→ ${result.displayPath}\n\n${result.entries}`)],
        }));
      }
    } catch (e) {
      get().setError((e as Error).message);
    }
  },

  async togglePlanMode() {
    const next = !get().planMode;
    if (next) localStorage.setItem(STORAGE_KEY_PLAN_MODE, "1");
    else localStorage.removeItem(STORAGE_KEY_PLAN_MODE);
    set({ planMode: next });
    if (next) {
      await get().loadPlan().catch(() => undefined);
    }
  },

  async loadPlan() {
    set({ planLoading: true });
    try {
      // Генерируем UUID на фронтенде (доступен в Tauri 2 webview)
      const uuid = crypto.randomUUID();
      const path = await invoke<string>("ensure_plan_file", {
        uuid,
      });
      set({ planFilePath: path });
    } catch (e) {
      get().setError(`План: ${(e as Error).message}`);
    } finally {
      set({ planLoading: false });
    }
  },

  async savePlan(text) {
    const path = get().planFilePath;
    if (!path) return;
    try {
      await invoke("write_plan_file", { path, text });
    } catch (e) {
      get().setError(`Сохранение плана: ${(e as Error).message}`);
    }
  },

  async commitPlan() {
    const { planFilePath, planMode } = get();
    if (!planMode || !planFilePath) return;
    // Выключаем plan mode, шлём prompt
    localStorage.removeItem(STORAGE_KEY_PLAN_MODE);
    set({ planMode: false });
    const prompt = `Реализуй план из файла \`${planFilePath}\`. Сначала прочитай plan file, затем выполняй задачи по порядку. По мере выполнения обновляй чекбоксы в plan file с [ ] на [x], измени Status на "executing", а после завершения на "done". Можешь редактировать код и запускать команды. Если возникнут вопросы — спроси.`;
    try {
      await rpc.sendPrompt(prompt, { sessionId: get().activeTabId });
    } catch (e) {
      get().setError((e as Error).message);
    }
  },

  setAttachedSkills(names) {
    const arr = Array.from(
      new Set(names.map(normalizeSkillName).filter(Boolean)),
    );
    const st = get();
    const sessionFile = st.agentState?.sessionFile;
    if (sessionFile) {
      writeAttachedSkills(sessionFile, arr, true);
    } else {
      writeAttachedSkills(st.activeTabId, arr, false);
    }
    set({ attachedSkills: arr });
  },

  toggleAttachedSkill(name) {
    const n = normalizeSkillName(name);
    const cur = get().attachedSkills;
    if (cur.includes(n)) {
      get().setAttachedSkills(cur.filter((x) => x !== n));
    } else {
      get().setAttachedSkills([...cur, n]);
    }
  },

  async suggestSkills(query) {
    const trimmed = query.trim();
    if (!trimmed) return [];
    try {
      const res = await rpc.suggestSkills(trimmed, { limit: 5, minScore: 0.1, sessionId: get().activeTabId });
      return res.skills;
    } catch {
      return [];
    }
  },

  async autoAttachSkills(query) {
    const suggestions = await get().suggestSkills(query);
    if (suggestions.length === 0) return;
    const current = get().attachedSkills;
    const names = suggestions.map((s) => normalizeSkillName(s.name));
    get().setAttachedSkills([...current, ...names]);
  },

  async setSessionName(name) {
    try {
      await rpc.setSessionName(name, get().activeTabId);
      await get().refreshState();
    } catch (e) {
      get().setError((e as Error).message);
    }
  },

  async refreshSessionStats() {
    try {
      const s = await rpc.getSessionStats(get().activeTabId);
      set({ sessionStats: s });
    } catch {
      // не фатально
    }
  },

  async forkAt(uiMessageId) {
    const { messages } = get();
    const msg = messages.find((m) => m.id === uiMessageId);
    if (!msg) return;

    // Resolve piId: for user messages fallback via getForkMessages,
    // for assistant messages reload history first to get annotated entryIds.
    let piId: string | null = get().uiToPiId[uiMessageId] ?? null;

    if (!piId && msg.role === "user") {
      const forkText = joinText(msg.blocks);
      piId = await resolveUserForkPiId(uiMessageId, forkText, get().uiToPiId, msg.timestamp);
    }

    if (!piId) {
      // Reload history to populate entryIds for assistant messages, then retry.
      await get().reloadHistory().catch(() => undefined);
      piId = get().uiToPiId[uiMessageId] ?? null;
    }

    if (!piId) {
      // Last-resort fallback: after reload UI ids are regenerated, so match by
      // message text/timestamp against current rendered history.
      const text = joinText(msg.blocks);
      const reloaded = get().messages.filter((m) => m.role === msg.role);
      const target = normalizeForMatch(text);
      const matched = closestUiMessageByText(reloaded, target, msg.timestamp);
      piId = matched ? get().uiToPiId[matched.id] ?? null : null;
    }

    if (!piId) {
      get().setError("Не нашёл pi-id у сообщения для форка");
      return;
    }
    try {
      set({ switching: true });
      const sourceFile = get().agentState?.sessionFile;
      if (!sourceFile) {
        get().setError("Нельзя создать fork-tab: у текущей сессии ещё нет файла истории");
        return;
      }
      const sourceTabId = get().activeTabId;
      const forkTabId = await get().createSessionTab("fork", { mode: "empty", sessionPath: sourceFile });
      if (!forkTabId) return;
      const res = await rpc.fork(piId, { position: "at", sessionId: forkTabId });
      if (res.cancelled) {
        if (sourceTabId) await get().activateTab(sourceTabId).catch(() => undefined);
        return;
      }
      await get().activateTab(forkTabId);
      await get().refreshState();
      await get().reloadHistory();
      await get().refreshSessionStats().catch(() => undefined);
      rememberOpenTabsSnapshot(get());
      notifySessionsChanged();
      const label = res.text
        ? `Форк от: «${res.text.slice(0, 80)}${res.text.length > 80 ? "…" : ""}»`
        : "Создан fork-tab — исходная вкладка сохранена";
      set({ forkBanner: label });
      setTimeout(() => set({ forkBanner: null }), 5000);
    } catch (e) {
      get().setError((e as Error).message);
    } finally {
      set({ switching: false });
    }
  },

  async regenerateAt(uiMessageId) {
    // Используем navigate_tree вместо fork: остаёмся в том же файле сессии,
    // MCP не перезагружаются (нет session_start), нет overhead fork-файла.
    const { messages, uiToPiId, agentState } = get();
    if (agentState?.isStreaming) await get().abortStreaming();

    const idx = messages.findIndex((m) => m.id === uiMessageId);
    if (idx < 0) return;
    let userMsg: UiMessage | undefined;
    for (let i = idx - 1; i >= 0; i--) {
      if (messages[i].role === "user") { userMsg = messages[i]; break; }
    }
    if (!userMsg) {
      get().setError("Нет родительского user-сообщения для регенерации");
      return;
    }
    const text = userMsg.blocks
      .filter((b): b is UiBlockText => b.kind === "text")
      .map((b) => b.text)
      .join("\n");
    const piId = await resolveUserForkPiId(userMsg.id, text, uiToPiId, userMsg.timestamp);
    if (!piId) {
      get().setError("Не нашёл pi-id user-сообщения");
      return;
    }
    try {
      set({ switching: true });
      // navigate_tree на user-сообщение: leaf = parent (убирает это сообщение и всё после).
      const res = await rpc.navigateTree(piId, { sessionId: get().activeTabId });
      if (res.cancelled) return;
      get().clearMessages();
      await get().refreshState().catch(() => undefined);
      await get().reloadHistory().catch(() => undefined);
      await rpc.sendPrompt(text, { sessionId: get().activeTabId });
    } catch (e) {
      get().setError((e as Error).message);
    } finally {
      set({ switching: false });
    }
  },

  async editUserMessage(uiMessageId, newText) {
    const { messages, uiToPiId, agentState } = get();
    if (agentState?.isStreaming) await get().abortStreaming();
    const sessionFile = agentState?.sessionFile;
    if (!sessionFile) {
      get().injectComposer(newText);
      return;
    }

    // Ищем pi-id САМОГО редактируемого сообщения (не предыдущего).
    // truncate_session_at теперь ИСКЛЮЧАЕТ найденную строку, поэтому
    // передача id редактируемого сообщения обрезает всё начиная с него.
    const editedMsg = messages.find((m) => m.id === uiMessageId);
    // Пробуем разрешить pi-id пока RPC ещё жив (нужен для getForkMessages-fallback).
    const editedPiId: string | null =
      uiToPiId[uiMessageId] ??
      (editedMsg
        ? await resolveUserForkPiId(uiMessageId, joinText(editedMsg.blocks), uiToPiId, editedMsg.timestamp).catch(() => null)
        : null);

    if (!editedPiId) {
      get().setError("Не нашёл pi-id редактируемого сообщения — невозможно усечь сессию");
      return;
    }
    try {
      set({ switching: true });
      try {
        const treeRes = await rpc.navigateTree(editedPiId, { sessionId: get().activeTabId });
        if (treeRes.cancelled) return;
        await get().refreshState().catch(() => undefined);
        get().clearMessages();
        await get().reloadHistory().catch(() => undefined);
        get().injectComposer(newText);
        return;
      } catch (treeError) {
        get().setError(`navigate_tree не сработал, использую fallback с перезапуском: ${(treeError as Error).message}`);
      }
      await rpc.rpcStop().catch(() => undefined);
      set({ rpcRunning: false, agentState: null });
      await rpc.truncateSession(sessionFile, editedPiId);
      get().clearMessages();
      await get().startRpc({ sessionFile });
      get().injectComposer(newText);
    } catch (e) {
      get().setError((e as Error).message);
    } finally {
      set({ switching: false });
    }
  },

  async runBash(command) {
    if (!command.trim()) return;
    try {
      const result = await rpc.bash(command, 120_000, get().activeTabId);
      // Добавляем system-блок в конец потока, чтобы пользователь видел вывод.
      const blocks: UiBlock[] = [
        { kind: "text", text: "$ " + command },
        {
          kind: "text",
          text:
            (result.output ?? "") +
            (result.truncated ? `\n…(truncated, full: ${result.fullOutputPath})` : "") +
            `\n[exit ${result.exitCode}${result.cancelled ? ", cancelled" : ""}]`,
        },
      ];
      const msg: UiMessage = {
        id: newId(),
        role: "system",
        blocks,
        streaming: false,
        timestamp: Date.now(),
      };
      set((s) => ({ messages: [...s.messages, msg] }));
    } catch (e) {
      get().setError((e as Error).message);
    }
  },

  injectComposer(text) {
    const currentValue = get().composerValue;
    const merged = currentValue ? `${currentValue}\n\n${text}` : text;
    set({ composerInjection: { text: merged, nonce: Date.now() } });
  },
  clearComposerInjection() {
    set({ composerInjection: null });
  },
  clearForkBanner() {
    set({ forkBanner: null });
  },

  addPendingPermissionBlock(permId, name, input, tabId) {
    const target = tabId ?? get().activeTabId;
    if (target && closedTabIds.has(target) && !get().tabs.has(target)) return;
    if (target) get().markTabWaiting("permission", target);
    addPendingToolBlock(target ? makeScopedSet(target, set, get) : set, permId, name, input);
  },
  removePendingPermissionBlock(permId, tabId) {
    const target = tabId ?? get().activeTabId;
    const scopedSet = target ? makeScopedSet(target, set, get) : set;
    scopedSet((s) => ({
      messages: s.messages.map((m) => ({
        ...m,
        blocks: m.blocks.filter(
          (b) => !(b.kind === "tool" && b.toolUseId === permId),
        ),
      })),
    }));
    if (target) get().clearTabWaiting("permission", target);
  },

  addPendingAskUserBlock(askUserId, input, tabId) {
    const target = tabId ?? get().activeTabId;
    if (target && closedTabIds.has(target) && !get().tabs.has(target)) return;
    if (target) get().markTabWaiting("askUser", target);
    addPendingToolBlock(target ? makeScopedSet(target, set, get) : set, askUserId, "ask_user", input);
  },
  removePendingAskUserBlock(askUserId, tabId) {
    const target = tabId ?? get().activeTabId;
    const scopedSet = target ? makeScopedSet(target, set, get) : set;
    scopedSet((s) => ({
      messages: s.messages.map((m) => ({
        ...m,
        blocks: m.blocks.filter(
          (b) => !(b.kind === "tool" && b.toolUseId === askUserId),
        ),
      })),
    }));
    if (target) get().clearTabWaiting("askUser", target);
  },

  markTabWaiting(kind, tabId) {
    const target = tabId ?? get().activeTabId;
    if (!target) return;
    const tab = get().tabs.get(target) ?? createDefaultSessionTab(target);
    const current = tab.pendingUserAction;
    get().updateTab(target, {
      pendingUserAction: {
        kind,
        count: (current?.count ?? 0) + 1,
      },
    });
  },

  clearTabWaiting(kind, tabId) {
    const target = tabId ?? get().activeTabId;
    if (!target) return;
    const tab = get().tabs.get(target);
    if (!tab?.pendingUserAction) return;
    const current = tab.pendingUserAction;
    const nextCount = current.count - 1;
    get().updateTab(target, {
      pendingUserAction: nextCount > 0 ? { ...current, count: nextCount } : null,
    });
  },

  async runFastContext(query) {
    const q = query.trim();
    if (!q) {
      get().setError("Fast Context: введите запрос для поиска по проекту");
      return;
    }
    const runId = get().fastContextRunId + 1;
    set({
      fastContextRunId: runId,
      fastContextStatus: "searching",
      fastContextResults: null,
      fastContextQuery: q,
      fastContextError: null,
    });
    try {
      const result = await rpc.fastContext(q, get().activeTabId);
      if (get().fastContextRunId !== runId) return;
      set({ fastContextStatus: "done", fastContextResults: result, fastContextError: null });
    } catch (e) {
      if (get().fastContextRunId !== runId) return;
      const message = (e as Error).message;
      console.error("fastContext failed:", e);
      set({ fastContextStatus: "error", fastContextResults: null, fastContextError: message });
      get().setError(`Fast Context: ${message}`);
    }
  },

  clearFastContext() {
    set({ fastContextStatus: null, fastContextResults: null, fastContextQuery: null, fastContextError: null });
  },

  async runFastFetch(query, options) {
    const q = query.trim();
    if (!q) {
      get().setError("Fast Fetch: введите URL или поисковый запрос");
      return;
    }
    const runId = get().fastFetchRunId + 1;
    set({
      fastFetchRunId: runId,
      fastFetchStatus: "fetching",
      fastFetchResult: null,
      fastFetchQuery: q,
      fastFetchError: null,
    });
    try {
      const result = await rpc.fastFetch(q, { ...options, sessionId: get().activeTabId });
      if (get().fastFetchRunId !== runId) return;
      set({ fastFetchStatus: "done", fastFetchResult: result, fastFetchError: null });
      const title = result.details?.url ? `Fast Fetch: ${result.details.url}` : `Fast Fetch: ${q}`;
      set((state) => ({
        messages: [...state.messages, createSystemMessage(`${title}\n\n${result.text}`)],
      }));
    } catch (e) {
      if (get().fastFetchRunId !== runId) return;
      const message = (e as Error).message;
      console.error("fastFetch failed:", e);
      set({ fastFetchStatus: "error", fastFetchResult: null, fastFetchError: message });
      get().setError(`Fast Fetch: ${message}`);
    }
  },

  clearFastFetch() {
    set({ fastFetchStatus: null, fastFetchResult: null, fastFetchQuery: null, fastFetchError: null });
  },

  setError(msg) {
    set({ errorBanner: msg });
  },
});
});

// === обработка событий pi ===

function handleAgentEvent(
  event: Record<string, unknown>,
  set: (
    partial:
      | Partial<ChatState>
      | ((s: ChatState) => Partial<ChatState>),
  ) => void,
  get: () => ChatState,
) {
  const t = event.type as string | undefined;
  if (!t) return;
  if (t === "extension_ui_request") {
    const method = String(event.method ?? "");
    const key = String(event.statusKey ?? "");
    if (method === "setStatus" && key === "mcp") {
      const text = event.statusText;
      debugMcp("setStatus:mcp", text);
      if (typeof text !== "string" || text.length === 0) {
        // Пустой статус — загрузка завершена, снимаем только если не идёт switch.
        if (!activeSwitch) setMcpLoading(set, false);
      } else if (isMcpLoadingStatus(text)) {
        setMcpLoading(set, true);
      } else {
        // "✓ MCP: 9 ready" и подобные — снимаем только если нет активного switch.
        // (switch сам вызывает setMcpLoading(false) в finally после завершения)
        if (!activeSwitch) setMcpLoading(set, false);
      }
    }
  }

  switch (t) {
    case "agent_start": {
      set((s) => ({
        agentState: s.agentState
          ? { ...s.agentState, isStreaming: true }
          : s.agentState,
      }));
      ensurePendingAssistantAfterUser(set);
      break;
    }
    case "agent_end": {
      clearScheduledSessionStatsRefresh();
      set((s) => ({
        messages: s.messages.map((m) => {
          if (m.pendingAssistant && m.blocks.length === 0) {
            return {
              ...m,
              blocks: [{ kind: "text", text: "Агент завершил работу без видимого ответа." }],
              streaming: false,
              pendingAssistant: false,
            };
          }
          return m.streaming ? { ...m, streaming: false, pendingAssistant: false } : m;
        }),
        currentAssistantId: null,
        agentState: s.agentState
          ? { ...s.agentState, isStreaming: false }
          : s.agentState,
      }));
      void Promise.all([
        get().refreshSessionStats(),
        get().refreshState(),
      ]).finally(() => notifySessionsChanged());
      break;
    }
    case "message_start":
    case "message_update":
    case "message_end": {
      const piMsg = (event.message ?? {}) as Record<string, unknown>;
      if (isHiddenCwdChangeMessage(piMsg)) break;
      const rawRole = String(piMsg.role ?? event.role ?? "assistant");
      // toolResult-сообщения мерджим в предыдущий ассистент по toolCallId
      if (rawRole === "toolResult") {
        const toolCallId = String(piMsg.toolCallId ?? "");
        if (toolCallId) {
          const isError = Boolean(piMsg.isError);
          const text = extractToolText(piMsg.content);
          const images = extractToolImages(piMsg.content);
          updateToolBlock(set, get, toolCallId, {
            name: String(piMsg.toolName ?? "tool"),
            output: text,
            images: images.length > 0 ? images : undefined,
            details: piMsg.details,
            status: isError ? "error" : "done",
          });
        }
        break;
      }
      const role = (rawRole as UiMessage["role"]) || "assistant";
      const piId = extractPiMessageId(piMsg, event);
      const blocks = agentContentToBlocks(piMsg.content);
      const isFinal = t === "message_end";
      upsertMessage(set, get, {
        piId,
        role,
        blocks,
        streaming: !isFinal && role === "assistant",
        timestamp:
          typeof piMsg.timestamp === "number"
            ? (piMsg.timestamp as number)
            : Date.now(),
        markCurrent: !isFinal && role === "assistant",
        replace: true,
      });
      if (t === "message_update" && role === "assistant") {
        scheduleSessionStatsRefresh(get);
      }
      break;
    }
    case "tool_execution_start": {
      const toolUseId = String(
        event.toolCallId ?? event.toolUseId ?? event.id ?? newId(),
      );
      const name = String(event.toolName ?? event.name ?? "tool");
      const input = event.args ?? event.input;
      // Remove any matching pending block from the messages
      // (it was created by addPendingPermissionBlock before approval)
      set((s) => ({
        messages: s.messages.map((m) => ({
          ...m,
          blocks: m.blocks.filter((b) => !(
            b.kind === "tool" && b.status === "pending" && b.name === name
          )),
        })),
      }));
      // Clean up any stale pending permissions that match this tool
      const extState = useExt.getState();
      const staleIdx = extState.pendingPermissions.findIndex(
        (p) => p.permissionToolName === name || (p.permissionType === "bash" && name === "bash"),
      );
      if (staleIdx !== -1) {
        extState.removePendingPermission(extState.pendingPermissions[staleIdx].id);
      }
      // Clean up any stale pending askUser requests that match this tool
      if (name === "ask_user" || name === "askUser") {
        extState.pendingAskUsers.forEach((p) => extState.removePendingAskUser(p.id));
      }
      // Привязываем к последнему ассистент-сообщению
      attachToolBlock(set, get, toolUseId, {
        kind: "tool",
        toolUseId,
        name,
        input,
        status: "running",
      });
      break;
    }
    case "tool_execution_update": {
      const toolUseId = String(event.toolCallId ?? event.toolUseId ?? event.id ?? "");
      if (!toolUseId) break;
      const partial = event.partialResult ?? event.result ?? event.delta;
      const details = extractToolDetails(partial);
      const current = get()
        .messages.flatMap((m) => m.blocks)
        .find((b): b is UiBlockTool => b.kind === "tool" && b.toolUseId === toolUseId);
      updateToolBlock(set, get, toolUseId, {
        output: extractToolText(partial),
        details: mergeToolDetails(current?.details, details),
      });
      break;
    }
    case "tool_execution_end": {
      const toolUseId = String(event.toolCallId ?? event.toolUseId ?? event.id ?? "");
      if (!toolUseId) break;
      const isError = Boolean(event.isError ?? event.is_error);
      const name = String(event.toolName ?? event.name ?? "tool");
      const output = extractToolText(event.result ?? event.output);
      const details = extractToolDetails(event.result ?? event.output);
      const images = extractToolImages(event.result ?? event.output);
      updateToolBlock(set, get, toolUseId, {
        name,
        output,
        details,
        images: images.length > 0 ? images : undefined,
        status: isError ? "error" : "done",
      });
      if (name === "fast_context") {
        const result = extractFastContextResult(details, event.result ?? event.output);
        if (!isError && result) {
          set({
            fastContextStatus: "done",
            fastContextResults: result,
            fastContextQuery: result.query ?? null,
            fastContextError: null,
          });
        } else if (isError) {
          set({ fastContextStatus: "error", fastContextError: output || "fast_context failed" });
        }
      }
      if (name === "fast_fetch") {
        const result = extractFastFetchResult(details, output, event.result ?? event.output);
        if (!isError && result) {
          set({
            fastFetchStatus: "done",
            fastFetchResult: result,
            fastFetchQuery: result.details?.url ?? null,
            fastFetchError: null,
          });
        } else if (isError) {
          set({ fastFetchStatus: "error", fastFetchError: output || "fast_fetch failed" });
        }
      }
      break;
    }
    case "queue_update": {
      const pending = event.pendingMessageCount;
      if (typeof pending === "number") {
        set({ pendingMessageCount: pending });
      } else {
        // pi не всегда шлёт счётчик — попробуем посчитать из массивов
        const steering = Array.isArray(event.steering) ? event.steering.length : 0;
        const followUp = Array.isArray(event.followUp) ? event.followUp.length : 0;
        set({ pendingMessageCount: steering + followUp });
      }
      break;
    }
    case "compaction_start": {
      set((s) => ({
        agentState: s.agentState
          ? { ...s.agentState, isCompacting: true }
          : s.agentState,
      }));
      break;
    }
    case "compaction_end": {
      const result = event.result;
      const aborted = event.aborted === true;
      const errorMessage = typeof event.errorMessage === "string" ? event.errorMessage : undefined;
      const compaction = !aborted && !errorMessage && result ? formatCompactionMessage(result) : null;
      set((s) => {
        const shouldAppend = Boolean(compaction && compaction.key !== s.lastCompactionMessageKey);
        return {
          agentState: s.agentState
            ? { ...s.agentState, isCompacting: false }
            : s.agentState,
          lastCompactionMessageKey: compaction?.key ?? s.lastCompactionMessageKey,
          messages: shouldAppend ? [...s.messages, createSystemMessage(compaction!.text)] : s.messages,
        };
      });
      // после компакции обновляем историю и статистику контекста, но оставляем видимый системный маркер
      void Promise.all([
        get().reloadHistory(),
        get().refreshSessionStats(),
        get().refreshState(),
      ]).then(() => {
        if (!compaction) return;
        const current = get();
        if (current.lastCompactionMessageKey !== compaction.key) return;
        const hasMarker = current.messages.some((message) =>
          message.blocks.some((block) => block.kind === "text" && block.text === compaction.text),
        );
        if (!hasMarker) {
          set((s) => ({ messages: [...s.messages, createSystemMessage(compaction.text)] }));
        }
      });
      break;
    }
    case "turn_start":
    case "turn_end":
    case "extension_error":
      break;
    case "auto_retry_start": {
      const attempt = typeof event.attempt === "number" ? event.attempt : 0;
      set((s) => ({
        retryStatus: {
          active: true,
          attempt,
          maxAttempts: typeof event.maxAttempts === "number" ? event.maxAttempts : undefined,
          delayMs: typeof event.delayMs === "number" ? event.delayMs : undefined,
          errorMessage: typeof event.errorMessage === "string" ? event.errorMessage : undefined,
        },
        agentState: s.agentState ? { ...s.agentState, isRetrying: true, retryAttempt: attempt } : s.agentState,
      }));
      break;
    }
    case "auto_retry_end": {
      set((s) => ({
        retryStatus: {
          active: false,
          attempt: typeof event.attempt === "number" ? event.attempt : s.retryStatus.attempt,
          finalError: typeof event.finalError === "string" ? event.finalError : undefined,
        },
        agentState: s.agentState ? { ...s.agentState, isRetrying: false, retryAttempt: 0 } : s.agentState,
      }));
      break;
    }
    default:
      // нерелевантные/будущие события — игнор
      break;
  }
}

// === helpers ===

interface UpsertOpts {
  piId?: string;
  role: UiMessage["role"];
  blocks: UiBlock[];
  streaming: boolean;
  timestamp: number;
  markCurrent: boolean;
  replace?: boolean;
}

function upsertMessage(
  set: (
    partial:
      | Partial<ChatState>
      | ((s: ChatState) => Partial<ChatState>),
  ) => void,
  _get: () => ChatState,
  opts: UpsertOpts,
) {
  set((s) => {
    const idMap = new Map(s.messageIdMap);
    // 1) если piId известен и уже привязан к UI-сообщению — апдейтим его
    let targetUiId = opts.piId ? idMap.get(opts.piId) : undefined;

    // 2) Если piId нет (или это новый id), но мы стримим ассистента —
    //    обновляем уже созданное current-сообщение, чтобы не плодить дубли.
    if (!targetUiId && opts.role === "assistant" && s.currentAssistantId) {
      const cur = s.messages.find((m) => m.id === s.currentAssistantId);
      if (cur && cur.role === "assistant") {
        targetUiId = s.currentAssistantId;
        if (opts.piId) idMap.set(opts.piId, targetUiId);
      }
    }

    // 3) Склейка реального pi user-message с локальным optimistic echo.
    //    Pi Pine очищает composer сразу после Enter, но настоящий user-message
    //    приходит только асинхронным RPC event. Если pi зависнет между response
    //    и message_start — без optimistic echo пользователь видит "ничего".
    //    Когда echo всё-таки приходит, подтверждаем локальное сообщение вместо
    //    создания дубля.
    //    - Если текст совпадает: оставляем локальные блоки (чтобы не показывать
    //      технические префиксы plan-mode / expanded files / skills).
    //    - Если текст не совпадает: pi расширил команду/скилл (commit-msg →
    //      полный текст), заменяем блоки на real-блоки из pi.
    if (!targetUiId && opts.role === "user") {
      const incomingText = normalizeForMatch(joinText(opts.blocks));
      for (let i = s.messages.length - 1; i >= 0; i--) {
        const candidate = s.messages[i];
        if (candidate.role !== "user" || !candidate.localEcho) continue;
        const localText = normalizeForMatch(joinText(candidate.blocks));
        const closeEnough = Math.abs(opts.timestamp - candidate.timestamp) < 120_000;
        if (!closeEnough) continue;

        if (opts.piId) idMap.set(opts.piId, candidate.id);
        const nextUiToPi = { ...s.uiToPiId };
        if (opts.piId) nextUiToPi[candidate.id] = opts.piId;

        const textMatches =
          !localText ||
          !incomingText ||
          incomingText.includes(localText) ||
          localText.includes(incomingText) ||
          sameBlocks(candidate.blocks, opts.blocks);

        const messages = s.messages.map((m) =>
          m.id === candidate.id
            ? {
                ...m,
                // Если текст не совпал — pi расширил команду/скилл,
                // показываем расширенную версию.
                blocks: textMatches ? m.blocks : opts.blocks,
                optimistic: false,
                localEcho: false,
                error: undefined,
              }
            : m,
        );
        return { messages, messageIdMap: idMap, uiToPiId: nextUiToPi };
      }
    }

    // 4) Дедупликация user echo от pi. RPC может прислать user message_start/end
    //    уже после того, как локальный optimistic echo был подтверждён или после
    //    assistant event. Поэтому нельзя проверять только последний message или
    //    только localEcho: ищем ближайший уже видимый user-message с тем же текстом.
    if (!targetUiId && opts.role === "user" && opts.blocks.length > 0) {
      const incomingText = normalizeForMatch(joinText(opts.blocks));
      for (let i = s.messages.length - 1; i >= 0; i--) {
        const candidate = s.messages[i];
        if (candidate.role !== "user") continue;
        const candidateText = normalizeForMatch(joinText(candidate.blocks));
        const closeEnough = Math.abs(opts.timestamp - candidate.timestamp) < 15_000;
        const textMatches =
          incomingText.length > 0 &&
          candidateText.length > 0 &&
          (incomingText === candidateText ||
            incomingText.includes(candidateText) ||
            candidateText.includes(incomingText) ||
            sameBlocks(candidate.blocks, opts.blocks));
        if (!closeEnough || !textMatches) continue;

        if (opts.piId) idMap.set(opts.piId, candidate.id);
        const nextUiToPi = { ...s.uiToPiId };
        if (opts.piId) nextUiToPi[candidate.id] = opts.piId;
        const messages = s.messages.map((m) =>
          m.id === candidate.id
            ? { ...m, optimistic: false, localEcho: false, error: undefined }
            : m,
        );
        return { messages, messageIdMap: idMap, uiToPiId: nextUiToPi };
      }
    }

    if (targetUiId) {
      const targetUiIdResolved = targetUiId;
      const messages = s.messages.map((m) =>
        m.id === targetUiIdResolved
          ? {
              ...m,
              role: opts.role,
              blocks:
                opts.replace && m.pendingAssistant && opts.blocks.length === 0 && opts.streaming
                  ? m.blocks
                  : opts.replace
                    ? opts.blocks
                    : mergeBlocks(m.blocks, opts.blocks),
              streaming: opts.streaming,
              optimistic: false,
              localEcho: false,
              error: undefined,
              pendingAssistant: Boolean(m.pendingAssistant && opts.blocks.length === 0 && opts.streaming),
            }
          : m,
      );
      const nextUiToPi = { ...s.uiToPiId };
      if (opts.piId) nextUiToPi[targetUiIdResolved] = opts.piId;
      return {
        messages,
        messageIdMap: idMap,
        uiToPiId: nextUiToPi,
        currentAssistantId: opts.markCurrent
          ? targetUiId
          : opts.role === "assistant" && !opts.streaming && s.currentAssistantId === targetUiId
            ? null
            : s.currentAssistantId,
      };
    }

    const uiId = newId();
    if (opts.piId) idMap.set(opts.piId, uiId);
    const msg: UiMessage = {
      id: uiId,
      role: opts.role,
      blocks: opts.blocks,
      streaming: opts.streaming,
      timestamp: opts.timestamp,
    };
    const nextUiToPi = { ...s.uiToPiId };
    if (opts.piId) nextUiToPi[uiId] = opts.piId;
    return {
      messages: [...s.messages, msg],
      messageIdMap: idMap,
      uiToPiId: nextUiToPi,
      currentAssistantId: opts.markCurrent ? uiId : s.currentAssistantId,
    };
  });
}

/** Поверхностное сравнение двух наборов блоков для дедупликации user-сообщений. */
function sameBlocks(a: UiBlock[], b: UiBlock[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x.kind !== y.kind) return false;
    if (x.kind === "text" && y.kind === "text" && x.text !== y.text) return false;
    if (x.kind === "thinking" && y.kind === "thinking" && x.text !== y.text) return false;
  }
  return true;
}

/** Для message_start: сохраняем уже накопленные tool-блоки если есть. */
function mergeBlocks(prev: UiBlock[], next: UiBlock[]): UiBlock[] {
  if (next.length === 0) return prev;
  // По tool-use id переносим выходы из старых блоков.
  const toolMap = new Map<string, UiBlockTool>();
  for (const b of prev) if (b.kind === "tool") toolMap.set(b.toolUseId, b);
  return next.map((b) => {
    if (b.kind !== "tool") return b;
    const old = toolMap.get(b.toolUseId);
    if (!old) return b;
    return {
      ...b,
      output: b.output ?? old.output,
      status: b.status === "running" ? old.status : b.status,
    };
  });
}

function attachToolBlock(
  set: (
    partial:
      | Partial<ChatState>
      | ((s: ChatState) => Partial<ChatState>),
  ) => void,
  _get: () => ChatState,
  toolUseId: string,
  block: UiBlockTool,
) {
  set((s) => {
    if (s.messages.length === 0) return {};
    // ищем последнее ассистент-сообщение со streaming=true
    let targetIdx = -1;
    for (let i = s.messages.length - 1; i >= 0; i--) {
      if (s.messages[i].role === "assistant") {
        targetIdx = i;
        break;
      }
    }
    if (targetIdx === -1) return {};
    const target = s.messages[targetIdx];
    // если такой tool-блок уже есть — ничего не делаем
    if (target.blocks.some((b) => b.kind === "tool" && b.toolUseId === toolUseId)) {
      return {};
    }
    const updated: UiMessage = {
      ...target,
      blocks: [...target.blocks, block],
      pendingAssistant: false,
    };
    const messages = [...s.messages];
    messages[targetIdx] = updated;
    return { messages };
  });
}

/** Add a pending permission block to the last assistant message */
function addPendingToolBlock(
  set: (
    partial:
      | Partial<ChatState>
      | ((s: ChatState) => Partial<ChatState>),
  ) => void,
  permId: string,
  name: string,
  input: unknown,
) {
  set((s) => {
    if (s.messages.length === 0) return {};
    let targetIdx = -1;
    for (let i = s.messages.length - 1; i >= 0; i--) {
      if (s.messages[i].role === "assistant") {
        targetIdx = i;
        break;
      }
    }
    if (targetIdx === -1) return {};
    const target = s.messages[targetIdx];
    // если pending block с таким id уже есть — ничего не делаем
    if (target.blocks.some((b) => b.kind === "tool" && b.toolUseId === permId)) {
      return {};
    }
    const block: UiBlockTool = {
      kind: "tool",
      toolUseId: permId,
      name,
      input,
      status: "pending",
    };
    const updated: UiMessage = {
      ...target,
      blocks: [...target.blocks, block],
      pendingAssistant: false,
    };
    const messages = [...s.messages];
    messages[targetIdx] = updated;
    return { messages };
  });
}

function updateToolBlock(
  set: (
    partial:
      | Partial<ChatState>
      | ((s: ChatState) => Partial<ChatState>),
  ) => void,
  _get: () => ChatState,
  toolUseId: string,
  patch: Partial<Omit<UiBlockTool, "kind" | "toolUseId">>,
) {
  set((s) => ({
    messages: s.messages.map((m) => {
      if (!m.blocks.some((b) => b.kind === "tool" && b.toolUseId === toolUseId)) return m;
      return {
        ...m,
        blocks: m.blocks.map((b) =>
          b.kind === "tool" && b.toolUseId === toolUseId ? { ...b, ...patch } : b,
        ),
        pendingAssistant: false,
      };
    }),
  }));
}

export type { AnyContent };
