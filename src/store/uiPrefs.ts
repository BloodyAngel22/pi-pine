import { getCurrentWebview } from "@tauri-apps/api/webview";
import { create } from "zustand";

const KEY_FONT = "pi-pine.fontScale";
const KEY_CHAT_FONT = "pi-pine.chatFontSize";
const KEY_DIFF_FONT = "pi-pine.diffFontSize";
const KEY_SESSIONS_W = "pi-pine.sessionsWidth";
const KEY_SIDEPANEL_W = "pi-pine.sidePanelWidth";
const KEY_DEEP_RESEARCH_MODE = "pi-pine.deepResearchMode";
const KEY_DIFF_VIEW_MODE = "pi-pine.diffViewMode";

const DEFAULT_FONT = 1.0;
const DEFAULT_CHAT_FONT = 1.0;
const DEFAULT_DIFF_FONT = 1.0;
const DEFAULT_SESSIONS_W = 288;
const DEFAULT_SIDEPANEL_W = 320;
const DEFAULT_DEEP_RESEARCH_MODE: DeepResearchMode = "balanced";
const DEFAULT_DIFF_VIEW_MODE: DiffViewMode = "full";

export const FONT_MIN = 0.85;
export const FONT_MAX = 1.5;
export const FONT_STEP = 0.05;
export const CHAT_FONT_MIN = 0.85;
export const CHAT_FONT_MAX = 1.5;
export const CHAT_FONT_STEP = 0.05;
export const DIFF_FONT_MIN = 0.85;
export const DIFF_FONT_MAX = 1.5;
export const DIFF_FONT_STEP = 0.05;
export const SESSIONS_MIN = 200;
export const SESSIONS_MAX = 480;
export const SIDEPANEL_MIN = 260;
export const SIDEPANEL_MAX = 600;
export type DeepResearchMode = "quick" | "balanced" | "deep";
export const DEEP_RESEARCH_MODES: DeepResearchMode[] = ["quick", "balanced", "deep"];
export type DiffViewMode = "compact" | "full";

interface UiPrefsState {
  fontScale: number;
  chatFontSize: number;
  diffFontSize: number;
  sessionsWidth: number;
  sidePanelWidth: number;
  deepResearchMode: DeepResearchMode;
  diffViewMode: DiffViewMode;
  setFontScale(v: number): void;
  setChatFontSize(v: number): void;
  setDiffFontSize(v: number): void;
  setSessionsWidth(v: number): void;
  setSidePanelWidth(v: number): void;
  setDeepResearchMode(v: DeepResearchMode): void;
  setDiffViewMode(v: DiffViewMode): void;
  resetFont(): void;
  resetChatFont(): void;
  resetDiffFont(): void;
}

function readNum(key: string, def: number): number {
  const raw = localStorage.getItem(key);
  if (!raw) return def;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : def;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function readDeepResearchMode(): DeepResearchMode {
  const raw = localStorage.getItem(KEY_DEEP_RESEARCH_MODE);
  return raw === "quick" || raw === "balanced" || raw === "deep" ? raw : DEFAULT_DEEP_RESEARCH_MODE;
}

function readDiffViewMode(): DiffViewMode {
  const raw = localStorage.getItem(KEY_DIFF_VIEW_MODE);
  return raw === "compact" || raw === "full" ? raw : DEFAULT_DIFF_VIEW_MODE;
}

function applyFontScale(scale: number) {
  const root = document.documentElement;
  const rounded = Math.round(scale * 1000) / 1000;

  // Масштаб интерфейса применяется через webview-zoom (как Ctrl+= в браузере).
  // Он масштабирует ВСЁ равномерно: px, иконки, rem — и при этом не ломает
  // floating UI, т.к. координатная система внутри webview остаётся согласованной.
  // Root font-size держим в дефолте, иначе будет двойное масштабирование.
  root.style.removeProperty("zoom");
  root.style.removeProperty("font-size");
  root.style.removeProperty("--app-font-size");

  // Сохраняем множитель информационно для кастомных стилей и диагностики.
  root.style.setProperty("--app-font-scale", String(rounded));

  // В обычном браузере getCurrentWebview() может быть недоступен, а в Tauri
  // отказ capability приходит как rejected promise — оба случая безопасно игнорируем.
  try {
    void getCurrentWebview().setZoom(rounded).catch(() => {});
  } catch {
    // not in tauri context
  }
}

function applyChatFontSize(scale: number) {
  // Применяем масштаб текста в чате как CSS-переменную --chat-font-mult.
  // Она используется в calc() внутри селекторов .md и .pi-composer-card textarea
  // для независимого от zoom масштабирования только текста чата.
  const root = document.documentElement;
  if (Math.abs(scale - 1.0) < 0.001) {
    root.style.removeProperty("--chat-font-mult");
  } else {
    root.style.setProperty(
      "--chat-font-mult",
      String(Math.round(scale * 1000) / 1000),
    );
  }
}

function applyDiffFontSize(scale: number) {
  // Аналогично --chat-font-mult, но для панели Diff (.pi-diff-content).
  const root = document.documentElement;
  if (Math.abs(scale - 1.0) < 0.001) {
    root.style.removeProperty("--diff-font-mult");
  } else {
    root.style.setProperty(
      "--diff-font-mult",
      String(Math.round(scale * 1000) / 1000),
    );
  }
}

export const useUiPrefs = create<UiPrefsState>((set) => {
  const fontScale = clamp(readNum(KEY_FONT, DEFAULT_FONT), FONT_MIN, FONT_MAX);
  const chatFontSize = clamp(readNum(KEY_CHAT_FONT, DEFAULT_CHAT_FONT), CHAT_FONT_MIN, CHAT_FONT_MAX);
  const diffFontSize = clamp(readNum(KEY_DIFF_FONT, DEFAULT_DIFF_FONT), DIFF_FONT_MIN, DIFF_FONT_MAX);
  const sessionsWidth = clamp(
    readNum(KEY_SESSIONS_W, DEFAULT_SESSIONS_W),
    SESSIONS_MIN,
    SESSIONS_MAX,
  );
  const sidePanelWidth = clamp(
    readNum(KEY_SIDEPANEL_W, DEFAULT_SIDEPANEL_W),
    SIDEPANEL_MIN,
    SIDEPANEL_MAX,
  );
  const deepResearchMode = readDeepResearchMode();
  const diffViewMode = readDiffViewMode();
  applyFontScale(fontScale);
  applyChatFontSize(chatFontSize);
  applyDiffFontSize(diffFontSize);

  return {
    fontScale,
    chatFontSize,
    diffFontSize,
    sessionsWidth,
    sidePanelWidth,
    deepResearchMode,
    diffViewMode,

    setFontScale(v) {
      const next = clamp(v, FONT_MIN, FONT_MAX);
      localStorage.setItem(KEY_FONT, String(next));
      applyFontScale(next);
      set({ fontScale: next });
    },
    setChatFontSize(v) {
      const next = clamp(v, CHAT_FONT_MIN, CHAT_FONT_MAX);
      localStorage.setItem(KEY_CHAT_FONT, String(next));
      applyChatFontSize(next);
      set({ chatFontSize: next });
    },
    setDiffFontSize(v) {
      const next = clamp(v, DIFF_FONT_MIN, DIFF_FONT_MAX);
      localStorage.setItem(KEY_DIFF_FONT, String(next));
      applyDiffFontSize(next);
      set({ diffFontSize: next });
    },
    setSessionsWidth(v) {
      const next = clamp(Math.round(v), SESSIONS_MIN, SESSIONS_MAX);
      localStorage.setItem(KEY_SESSIONS_W, String(next));
      set({ sessionsWidth: next });
    },
    setSidePanelWidth(v) {
      const next = clamp(Math.round(v), SIDEPANEL_MIN, SIDEPANEL_MAX);
      localStorage.setItem(KEY_SIDEPANEL_W, String(next));
      set({ sidePanelWidth: next });
    },
    setDeepResearchMode(v) {
      const next = v === "quick" || v === "balanced" || v === "deep" ? v : DEFAULT_DEEP_RESEARCH_MODE;
      localStorage.setItem(KEY_DEEP_RESEARCH_MODE, next);
      set({ deepResearchMode: next });
    },
    setDiffViewMode(v) {
      const next = v === "compact" || v === "full" ? v : DEFAULT_DIFF_VIEW_MODE;
      localStorage.setItem(KEY_DIFF_VIEW_MODE, next);
      set({ diffViewMode: next });
    },
    resetFont() {
      localStorage.removeItem(KEY_FONT);
      applyFontScale(DEFAULT_FONT);
      set({ fontScale: DEFAULT_FONT });
    },
    resetChatFont() {
      localStorage.removeItem(KEY_CHAT_FONT);
      applyChatFontSize(DEFAULT_CHAT_FONT);
      set({ chatFontSize: DEFAULT_CHAT_FONT });
    },
    resetDiffFont() {
      localStorage.removeItem(KEY_DIFF_FONT);
      applyDiffFontSize(DEFAULT_DIFF_FONT);
      set({ diffFontSize: DEFAULT_DIFF_FONT });
    },
  };
});
