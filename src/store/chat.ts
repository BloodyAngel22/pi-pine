import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import * as rpc from "@/rpc/bridge";
import type {
  AnyContent,
  Model,
  RpcSessionState,
  StreamingBehavior,
  ThinkingLevel,
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
  status: "running" | "done" | "error";
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
}

interface ChatState {
  // транспорт
  generation: number;
  rpcRunning: boolean;
  piPath: string | null;
  cliPathOverride: string | null;
  cwd: string;
  /** $HOME пользователя (для сокращения путей до ~). */
  home: string | null;
  // plan mode
  planMode: boolean;
  planFilePath: string | null;
  planLoading: boolean;
  // скиллы, прикреплённые ко всем сообщениям сессии
  attachedSkills: string[];
  // сессия переключается? (для UI-спиннера)
  switching: boolean;
  // состояние агента
  agentState: RpcSessionState | null;
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
  /** баннер после fork: пользователь теперь в новой ветке */
  forkBanner: string | null;
  // действия
  init(): Promise<void>;
  startRpc(opts?: { sessionFile?: string; safe?: boolean }): Promise<void>;
  stopRpc(): Promise<void>;
  restartRpc(opts?: { safe?: boolean }): Promise<void>;
  send(message: string, images?: import("@/rpc/types").ImageContent[]): Promise<void>;
  abortStreaming(): Promise<void>;
  clearMessages(): void;
  setCwd(cwd: string): void;
  setHome(home: string | null): void;
  /** Сменить cwd и перезапустить pi RPC. */
  changeCwd(next: string): Promise<void>;
  /** Plan mode actions */
  togglePlanMode(): Promise<void>;
  loadPlan(): Promise<void>;
  savePlan(text: string): Promise<void>;
  commitPlan(): Promise<void>;
  /** Skills */
  setAttachedSkills(names: string[]): void;
  toggleAttachedSkill(name: string): void;
  setCliPathOverride(p: string | null): void;
  setStreamingBehavior(b: StreamingBehavior): void;
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
  runBash(command: string): Promise<void>;
  injectComposer(text: string): void;
  clearComposerInjection(): void;
  setError(msg: string | null): void;
}

const STORAGE_KEY_CLI = "pi-pine.cliPathOverride";
const STORAGE_KEY_CWD = "pi-pine.cwd";
const STORAGE_KEY_PROVIDER = "pi-pine.provider";
const STORAGE_KEY_MODEL = "pi-pine.model";
const STORAGE_KEY_PLAN_MODE = "pi-pine.planMode";
const STORAGE_KEY_SKILLS = "pi-pine.attachedSkills";

function readPlanMode(): boolean {
  return localStorage.getItem(STORAGE_KEY_PLAN_MODE) === "1";
}
function normalizeSkillName(s: string): string {
  // Снимаем все ведущие "skill:" — на случай старых записей вида "skill:skill:foo".
  let r = s;
  while (r.startsWith("skill:")) r = r.slice(6);
  return r;
}
function readAttachedSkills(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SKILLS);
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

function joinText(blocks: UiBlock[]): string {
  return blocks
    .filter((b): b is UiBlockText => b.kind === "text")
    .map((b) => b.text)
    .join("");
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
    const res = await rpc.getForkMessages();
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
      const isError = Boolean(obj.is_error ?? obj.isError);
      const existing = blocks.find(
        (b): b is UiBlockTool => b.kind === "tool" && b.toolUseId === id,
      );
      if (existing) {
        existing.output = text;
        existing.status = isError ? "error" : "done";
      } else {
        blocks.push({
          kind: "tool",
          toolUseId: id || newId(),
          name: "tool",
          output: text,
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

export const useChat = create<ChatState>((set, get) => ({
  generation: 0,
  rpcRunning: false,
  piPath: null,
  cliPathOverride: localStorage.getItem(STORAGE_KEY_CLI),
  cwd:
    localStorage.getItem(STORAGE_KEY_CWD) ||
    (typeof window !== "undefined" ? "/" : "/"),
  home: null,
  planMode: readPlanMode(),
  planFilePath: null,
  planLoading: false,
  attachedSkills: readAttachedSkills(),
  switching: false,
  agentState: null,
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
  forkBanner: null,

  async init() {
    if (initOnce) return;
    initOnce = true;
    rpc.onEvent((event) => handleAgentEvent(event, set, get));
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
    const { cliPathOverride, cwd } = get();
    try {
      // ВАЖНО: НЕ передаём provider/model как CLI-флаги.
      // У pi есть extension-провайдеры (devin, omniroute и т.п.),
      // которые инициализируются лениво и НЕ известны на этапе argv-парсинга
      // — pi падает с "Unknown provider". Поэтому стартуем с дефолтной
      // моделью из ~/.pi/agent/settings.json, а нужную модель применяем
      // через RPC `set_model` после того, как pi полностью поднялся
      // (включая extension-провайдеры).
      const res = await rpc.rpcStart({
        cliPath: cliPathOverride ?? null,
        cwd,
        provider: undefined,
        model: undefined,
        sessionFile: opts?.sessionFile,
      });
      set({
        rpcRunning: true,
        generation: res.generation,
        piPath: res.piPath,
        errorBanner: null,
        stderrBuffer: [],
        messages: [],
        currentAssistantId: null,
        messageIdMap: new Map(),
      });
      // даем pi пару миллисекунд на инициализацию stdout
      await new Promise((r) => setTimeout(r, 50));
      await get().refreshState();
      await get().reloadHistory().catch(() => undefined);
      void get().loadAvailableModels();

      // Применяем сохранённую модель ПОСЛЕ старта.
      // Если safe=true — пропускаем (использовать дефолт pi).
      if (!opts?.safe) {
        const savedProvider = localStorage.getItem(STORAGE_KEY_PROVIDER);
        const savedModel = localStorage.getItem(STORAGE_KEY_MODEL);
        if (savedProvider && savedModel) {
          // Дать extension-провайдерам время поднять локальные сервера
          // (devin запускает proxy на 127.0.0.1:42102 ~1-2 сек).
          await new Promise((r) => setTimeout(r, 1500));
          try {
            await rpc.setModel(savedProvider, savedModel);
            await get().refreshState();
          } catch (e) {
            // Не валим RPC — просто сообщаем, что нужная модель недоступна,
            // pi работает на дефолтной.
            get().setError(
              `Не удалось активировать модель ${savedProvider}/${savedModel}: ${(e as Error).message}. Использую дефолтную.`,
            );
          }
        }
      }
    } catch (e) {
      get().setError((e as Error).message);
      set({ rpcRunning: false });
    }
  },

  async stopRpc() {
    await rpc.rpcStop().catch(() => undefined);
    set({ rpcRunning: false, agentState: null });
  },

  async restartRpc(opts) {
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
    set({ rpcRunning: false, agentState: null });
    // Небольшая пауза, чтобы pi-процесс успел корректно завершиться
    await new Promise((r) => setTimeout(r, 200));
    await get().startRpc(opts?.safe ? { safe: true } : undefined);
  },

  async send(message, images) {
    const { agentState, streamingBehavior, planMode, planFilePath, attachedSkills } = get();
    const trimmed = message.trim();
    if (!trimmed && (!images || images.length === 0)) return;

    // 1) plan mode: префикс с инструкциями для модели.
    let body = trimmed;
    if (planMode) {
      const planPath = planFilePath || "<plan.md>";
      const prefix =
        `[PLAN MODE] Не модифицируй файлы кроме \`${planPath}\`. ` +
        `Не запускай разрушительные команды (rm, mv, git push, drop и т.п.). ` +
        `Сначала исследуй кодовую базу через read-only инструменты (read_file, grep, list_dir). ` +
        `Веди и обновляй план в \`${planPath}\` (markdown, чек-листы, ссылки на файлы). ` +
        `Жди явного «Реализуй» от пользователя — не приступай к изменениям сейчас.\n\n`;
      body = prefix + body;
    }

    // 2) attached skills: добавляем хвостом
    if (attachedSkills.length > 0) {
      const tail = attachedSkills.map((s) => `/skill:${s}`).join(" ");
      body = body ? `${body}\n\n${tail}` : tail;
    }

    try {
      const opts: { images?: import("@/rpc/types").ImageContent[]; streamingBehavior?: StreamingBehavior } = {};
      if (agentState?.isStreaming) opts.streamingBehavior = streamingBehavior;
      if (images && images.length > 0) opts.images = images;
      await rpc.sendPrompt(body, Object.keys(opts).length > 0 ? opts : undefined);
    } catch (e) {
      get().setError((e as Error).message);
    }
  },

  async abortStreaming() {
    try {
      await rpc.abort();
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

  async setThinking(level) {
    try {
      await rpc.setThinkingLevel(level);
      await get().refreshState();
    } catch (e) {
      get().setError((e as Error).message);
    }
  },

  async switchModel(provider, modelId) {
    try {
      await rpc.setModel(provider, modelId);
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
      const s = await rpc.getState();
      set({ agentState: s, pendingMessageCount: s.pendingMessageCount ?? 0 });
    } catch {
      // RPC может ещё не быть готов
    }
  },

  async reloadHistory() {
    try {
      const res = await rpc.getMessages();
      const messages = Array.isArray(res.messages) ? res.messages : [];
      const ui: UiMessage[] = [];
      const idMap = new Map<string, string>();
      const uiToPi: Record<string, string> = {};
      for (const raw of messages) {
        const m = raw as Record<string, unknown>;
        const rawRole = String(m.role ?? "assistant");
        // toolResult — не отдельное сообщение, мерджим output в предыдущий toolCall
        if (rawRole === "toolResult") {
          const toolCallId = String(m.toolCallId ?? "");
          if (!toolCallId) continue;
          const text = extractToolText(m.content);
          const isError = Boolean(m.isError);
          for (let i = ui.length - 1; i >= 0; i--) {
            const um = ui[i];
            const target = um.blocks.find(
              (b): b is UiBlockTool => b.kind === "tool" && b.toolUseId === toolCallId,
            );
            if (target) {
              target.output = text;
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
      set({ messages: ui, messageIdMap: idMap, uiToPiId: uiToPi });
    } catch {
      // ignore
    }
  },

  async newSession() {
    if (get().switching) return;
    // Тот же UX-паттерн, что и switchSession: мгновенная очистка + спиннер.
    set({ switching: true, messages: [], currentAssistantId: null });
    try {
      await rpc.newSession();
      await get().refreshState().catch(() => undefined);
      await get().reloadHistory().catch(() => undefined);
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
    if (st.switching) return;
    if (st.agentState?.sessionFile === file) return;

    // Очищаем UI ДО блокирующего RPC-вызова, чтобы пользователь сразу
    // увидел переход и не кликал повторно. Сообщения будут заменены
    // одним set после reloadHistory.
    set({ switching: true, messages: [], currentAssistantId: null });
    try {
      // pi на switch_session эмитит session_before_switch (MCP cleanup) и
      // session_switch (MCP reload). Это нормальное поведение pi — мы не
      // вызываем этот RPC дважды и не делаем ничего, что добавило бы
      // лишних циклов.
      await rpc.switchSession(file);
      // Последовательно. Параллельные state-запросы вызывают повторную
      // отправку extension_ui_request (включая setStatus("mcp", ...)).
      await get().refreshState().catch(() => undefined);
      await get().reloadHistory().catch(() => undefined);
      if (get().planMode) {
        await get().loadPlan().catch(() => undefined);
      }
    } catch (e) {
      get().setError((e as Error).message);
    } finally {
      set({ switching: false });
    }
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
    const { cwd, agentState } = get();
    const sid = agentState?.sessionId || agentState?.sessionFile || "session";
    const slug = slugify(agentState?.sessionName || sid);
    set({ planLoading: true });
    try {
      const path = await invoke<string>("ensure_plan_file", {
        cwd,
        sessionId: String(sid),
        slug,
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
    const prompt = `Реализуй план из файла \`${planFilePath}\` шаг за шагом. Можешь редактировать код, запускать команды. Если возникнут вопросы — спроси.`;
    try {
      await rpc.sendPrompt(prompt);
    } catch (e) {
      get().setError((e as Error).message);
    }
  },

  setAttachedSkills(names) {
    const arr = Array.from(
      new Set(names.map(normalizeSkillName).filter(Boolean)),
    );
    if (arr.length > 0) localStorage.setItem(STORAGE_KEY_SKILLS, JSON.stringify(arr));
    else localStorage.removeItem(STORAGE_KEY_SKILLS);
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

  async setSessionName(name) {
    try {
      await rpc.setSessionName(name);
      await get().refreshState();
    } catch (e) {
      get().setError((e as Error).message);
    }
  },

  async refreshSessionStats() {
    try {
      const s = await rpc.getSessionStats();
      set({ sessionStats: s });
    } catch {
      // не фатально
    }
  },

  async forkAt(uiMessageId) {
    const { messages, uiToPiId } = get();
    const directPiId = uiToPiId[uiMessageId];
    const msg = messages.find((m) => m.id === uiMessageId);
    const userMsg =
      msg?.role === "user"
        ? msg
        : [...messages]
            .slice(0, messages.findIndex((m) => m.id === uiMessageId) + 1)
            .reverse()
            .find((m) => m.role === "user");
    const promptText = userMsg ? joinText(userMsg.blocks) : "";
    const piId = directPiId || (userMsg
      ? await resolveUserForkPiId(userMsg.id, promptText, uiToPiId, userMsg.timestamp)
      : null);
    if (!piId) {
      get().setError("Не нашёл pi-id у сообщения для форка");
      return;
    }
    try {
      set({ switching: true });
      const res = await rpc.fork(piId);
      if (res.cancelled) { set({ switching: false }); return; }
      get().clearMessages();
      await get().refreshState();
      await get().reloadHistory();
      // показываем баннер «вы теперь в новой ветке», авто-скрываем через 5 с
      const banner = res.text
        ? `Форк от: «${res.text.slice(0, 80)}${res.text.length > 80 ? "…" : ""}»`
        : "Создан форк — вы в новой ветке";
      set({ forkBanner: banner });
      setTimeout(() => set({ forkBanner: null }), 5000);
    } catch (e) {
      get().setError((e as Error).message);
    } finally {
      set({ switching: false });
    }
  },

  async regenerateAt(uiMessageId) {
    // Используем rpc.fork() вместо stop/truncate/start — pi остаётся запущенным,
    // не перезапускается процесс (= нет overhead перезапуска + 1500ms задержки).
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
      const res = await rpc.fork(piId);
      if (res.cancelled) return;
      get().clearMessages();
      await get().refreshState();
      await get().reloadHistory();
      await rpc.sendPrompt(text);
    } catch (e) {
      get().setError((e as Error).message);
    } finally {
      set({ switching: false });
    }
  },

  async editUserMessage(uiMessageId, newText) {
    // Используем rpc.fork() вместо stop/truncate/start — pi остаётся запущенным.
    const { messages, uiToPiId, agentState } = get();
    if (agentState?.isStreaming) await get().abortStreaming();

    const msg = messages.find((m) => m.id === uiMessageId);
    const originalText = msg ? joinText(msg.blocks) : newText;

    // Для edit нужно форкнуться до предыдущего сообщения (не самого user-msg),
    // чтобы убрать сам редактируемый запрос и все последующее.
    const idx = messages.findIndex((m) => m.id === uiMessageId);
    let forkPiId: string | null = null;
    if (idx > 0) {
      for (let i = idx - 1; i >= 0; i--) {
        const pm = messages[i];
        const id = uiToPiId[pm.id];
        if (id) { forkPiId = id; break; }
      }
    }
    // Если нет предыдущего сообщения, форкаемся от самого user-msg
    if (!forkPiId) {
      forkPiId = await resolveUserForkPiId(uiMessageId, originalText, uiToPiId, msg?.timestamp);
    }
    if (!forkPiId) {
      // fallback: просто подставим в композер
      get().injectComposer(newText);
      return;
    }
    try {
      set({ switching: true });
      const res = await rpc.fork(forkPiId);
      if (res.cancelled) return;
      get().clearMessages();
      await get().refreshState();
      await get().reloadHistory();
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
      const result = await rpc.bash(command);
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
    set({ composerInjection: { text, nonce: Date.now() } });
  },
  clearComposerInjection() {
    set({ composerInjection: null });
  },
  clearForkBanner() {
    set({ forkBanner: null });
  },

  setError(msg) {
    set({ errorBanner: msg });
  },
}));

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

  switch (t) {
    case "agent_start": {
      set((s) => ({
        agentState: s.agentState
          ? { ...s.agentState, isStreaming: true }
          : s.agentState,
      }));
      break;
    }
    case "agent_end": {
      set((s) => ({
        messages: s.messages.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
        currentAssistantId: null,
        agentState: s.agentState
          ? { ...s.agentState, isStreaming: false }
          : s.agentState,
      }));
      void get().refreshSessionStats();
      break;
    }
    case "message_start":
    case "message_update":
    case "message_end": {
      const piMsg = (event.message ?? {}) as Record<string, unknown>;
      const rawRole = String(piMsg.role ?? event.role ?? "assistant");
      // toolResult-сообщения мерджим в предыдущий ассистент по toolCallId
      if (rawRole === "toolResult") {
        const toolCallId = String(piMsg.toolCallId ?? "");
        if (toolCallId) {
          const isError = Boolean(piMsg.isError);
          const text = extractToolText(piMsg.content);
          updateToolBlock(set, get, toolCallId, {
            name: String(piMsg.toolName ?? "tool"),
            output: text,
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
      break;
    }
    case "tool_execution_start": {
      const toolUseId = String(
        event.toolCallId ?? event.toolUseId ?? event.id ?? newId(),
      );
      const name = String(event.toolName ?? event.name ?? "tool");
      const input = event.args ?? event.input;
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
      const toolUseId = String(event.toolCallId ?? event.toolUseId ?? "");
      if (!toolUseId) break;
      const partial = event.partialResult ?? event.result;
      updateToolBlock(set, get, toolUseId, {
        output: extractToolText(partial),
      });
      break;
    }
    case "tool_execution_end": {
      const toolUseId = String(event.toolCallId ?? event.toolUseId ?? event.id ?? "");
      if (!toolUseId) break;
      const isError = Boolean(event.isError ?? event.is_error);
      const output = extractToolText(event.result ?? event.output);
      updateToolBlock(set, get, toolUseId, {
        output,
        status: isError ? "error" : "done",
      });
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
      set((s) => ({
        agentState: s.agentState
          ? { ...s.agentState, isCompacting: false }
          : s.agentState,
      }));
      // после компакции перезагружаем историю
      void get().reloadHistory();
      break;
    }
    case "turn_start":
    case "turn_end":
    case "extension_error":
    case "auto_retry_start":
    case "auto_retry_end":
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

    // 3) Дедупликация повторных user-сообщений: если новое user-сообщение
    //    повторяет последнее по тексту в течение секунды — игнорируем.
    if (!targetUiId && opts.role === "user" && opts.blocks.length > 0) {
      const last = s.messages[s.messages.length - 1];
      if (
        last &&
        last.role === "user" &&
        Math.abs(opts.timestamp - last.timestamp) < 2000 &&
        sameBlocks(last.blocks, opts.blocks)
      ) {
        // ассоциируем piId с уже существующим, ничего не добавляем
        if (opts.piId) idMap.set(opts.piId, last.id);
        const nextUiToPi = { ...s.uiToPiId };
        if (opts.piId) nextUiToPi[last.id] = opts.piId;
        return { messageIdMap: idMap, uiToPiId: nextUiToPi };
      }
    }

    if (targetUiId) {
      const targetUiIdResolved = targetUiId;
      const messages = s.messages.map((m) =>
        m.id === targetUiIdResolved
          ? {
              ...m,
              role: opts.role,
              blocks: opts.replace ? opts.blocks : mergeBlocks(m.blocks, opts.blocks),
              streaming: opts.streaming,
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
      };
    }),
  }));
}

export type { AnyContent };
