import { invoke } from "@tauri-apps/api/core";

export interface ThemeInfo {
  name: string;
  path: string | null;
  source: "user" | "builtin";
}

export interface ThemeFile {
  name?: string;
  vars?: Record<string, string>;
  colors?: Record<string, string>;
}

export interface ResolvedTheme {
  name: string;
  /** ключ token → hex (после раскрытия vars) */
  tokens: Record<string, string>;
}

/** Раскрытие `colors` через `vars`: значение либо hex, либо имя из vars. */
export function resolveTheme(file: ThemeFile): ResolvedTheme {
  const vars = file.vars ?? {};
  const colors = file.colors ?? {};
  const tokens: Record<string, string> = { ...vars };
  for (const [k, v] of Object.entries(colors)) {
    if (typeof v !== "string") continue;
    if (v.startsWith("#")) {
      tokens[k] = v;
    } else if (vars[v]) {
      tokens[k] = vars[v];
    } else {
      tokens[k] = v;
    }
  }
  return { name: file.name ?? "unknown", tokens };
}

/** Маппинг pi-токенов → CSS-переменные нашего приложения. */
const TOKEN_MAP: Array<[string, string[], string]> = [
  // [css var, [возможные pi-токены], fallback hex]
  ["--color-bg", ["base", "bg"], "#0a0a0a"],
  ["--color-bg-soft", ["mantle", "bgSoft", "surface0"], "#131313"],
  ["--color-bg-mute", ["crust", "bgMute", "surface1"], "#1a1a1a"],
  ["--color-border", ["border", "surface2"], "#262626"],
  ["--color-border-muted", ["borderMuted", "surface1"], "#1f1f1f"],
  ["--color-fg", ["text"], "#ededed"],
  ["--color-fg-mute", ["subtext0", "subtext1", "fgMute", "muted"], "#a3a3a3"],
  ["--color-fg-dim", ["dim", "overlay0", "overlay1", "fgDim"], "#6b6b6b"],
  ["--color-accent", ["accent", "lavender", "blue"], "#7aa2f7"],
  ["--color-accent-soft", ["selectedBg", "accentSoft"], "#2c3a5a"],
  ["--color-danger", ["error", "red", "danger"], "#f7768e"],
  ["--color-warn", ["warning", "peach", "yellow", "warn"], "#e0af68"],
  ["--color-success", ["success", "green"], "#9ece6a"],
  ["--color-user-bg", ["userMessageBg", "mantle"], "#131313"],
  ["--color-user-fg", ["userMessageText", "text"], "#ededed"],
  ["--color-thinking", ["thinkingText", "subtext0"], "#a3a3a3"],
];

export function applyTheme(file: ThemeFile): void {
  const { tokens } = resolveTheme(file);
  const root = document.documentElement;
  for (const [cssVar, candidates, fallback] of TOKEN_MAP) {
    let value: string | undefined;
    for (const c of candidates) {
      if (tokens[c]) {
        value = tokens[c];
        break;
      }
    }
    root.style.setProperty(cssVar, value ?? fallback);
  }
}

export async function listThemes(): Promise<ThemeInfo[]> {
  return invoke<ThemeInfo[]>("list_themes_full");
}

export async function readTheme(name: string): Promise<ThemeFile> {
  return invoke<ThemeFile>("read_theme", { name });
}

export async function loadAndApply(name: string): Promise<ThemeFile | null> {
  try {
    const file = await readTheme(name);
    applyTheme(file);
    return file;
  } catch {
    return null;
  }
}
