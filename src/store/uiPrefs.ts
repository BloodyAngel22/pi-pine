import { create } from "zustand";

const KEY_FONT = "pi-pine.fontScale";
const KEY_CHAT_FONT = "pi-pine.chatFontSize";
const KEY_SESSIONS_W = "pi-pine.sessionsWidth";
const KEY_SIDEPANEL_W = "pi-pine.sidePanelWidth";
const KEY_DEEP_RESEARCH_MODE = "pi-pine.deepResearchMode";

const DEFAULT_FONT = 1.0;
const DEFAULT_CHAT_FONT = 1.0;
const DEFAULT_SESSIONS_W = 288;
const DEFAULT_SIDEPANEL_W = 320;
const DEFAULT_DEEP_RESEARCH_MODE: DeepResearchMode = "balanced";

export const FONT_MIN = 0.85;
export const FONT_MAX = 1.5;
export const FONT_STEP = 0.05;
export const CHAT_FONT_MIN = 0.85;
export const CHAT_FONT_MAX = 1.5;
export const CHAT_FONT_STEP = 0.05;
export const SESSIONS_MIN = 200;
export const SESSIONS_MAX = 480;
export const SIDEPANEL_MIN = 260;
export const SIDEPANEL_MAX = 600;
export type DeepResearchMode = "quick" | "balanced" | "deep";
export const DEEP_RESEARCH_MODES: DeepResearchMode[] = ["quick", "balanced", "deep"];

interface UiPrefsState {
  fontScale: number;
  chatFontSize: number;
  sessionsWidth: number;
  sidePanelWidth: number;
  deepResearchMode: DeepResearchMode;
  setFontScale(v: number): void;
  setChatFontSize(v: number): void;
  setSessionsWidth(v: number): void;
  setSidePanelWidth(v: number): void;
  setDeepResearchMode(v: DeepResearchMode): void;
  resetFont(): void;
  resetChatFont(): void;
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

function applyFontScale(scale: number) {
  // Используем CSS `zoom` на корневом элементе — это масштабирует ВСЁ
  // (включая Tailwind utility text-xs/text-sm и pixel-defined text-[11px]),
  // тогда как `font-size` влияет только на em/rem-зависимые размеры.
  // Поддерживается во всех Chromium/WebKit-движках, что использует Tauri.
  const root = document.documentElement;
  // 1.0 — без зума; убираем атрибут, чтобы не мешать дев-инструментам.
  if (Math.abs(scale - 1.0) < 0.001) {
    root.style.removeProperty("zoom");
  } else {
    root.style.setProperty("zoom", String(scale));
  }
  // Дополнительно сохраняем CSS-переменную (на случай, если кто-то будет
  // её использовать в кастомных стилях).
  root.style.setProperty(
    "--app-font-scale",
    String(Math.round(scale * 1000) / 1000),
  );
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

export const useUiPrefs = create<UiPrefsState>((set) => {
  const fontScale = clamp(readNum(KEY_FONT, DEFAULT_FONT), FONT_MIN, FONT_MAX);
  const chatFontSize = clamp(readNum(KEY_CHAT_FONT, DEFAULT_CHAT_FONT), CHAT_FONT_MIN, CHAT_FONT_MAX);
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
  applyFontScale(fontScale);
  applyChatFontSize(chatFontSize);

  return {
    fontScale,
    chatFontSize,
    sessionsWidth,
    sidePanelWidth,
    deepResearchMode,

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
  };
});
