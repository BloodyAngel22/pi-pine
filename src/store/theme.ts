import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { applyTheme, listThemes, readTheme, type ThemeFile, type ThemeInfo } from "@/themes/loader";

interface ThemeState {
  available: ThemeInfo[];
  current: string;
  file: ThemeFile | null;
  load(): Promise<void>;
  setTheme(name: string, persist?: boolean): Promise<void>;
}

const STORAGE_KEY = "pi-pine.theme";

export const useTheme = create<ThemeState>((set) => ({
  available: [],
  current: localStorage.getItem(STORAGE_KEY) || "",
  file: null,

  async load() {
    try {
      const list = await listThemes();
      set({ available: list });
      // приоритет: localStorage → settings.json (theme) → pi-pine-light
      let want = localStorage.getItem(STORAGE_KEY);
      if (!want) {
        try {
          const piSettings = await invoke<Record<string, unknown>>("read_pi_settings");
          if (piSettings && typeof piSettings.theme === "string") {
            want = piSettings.theme;
          }
        } catch {
          // ignore
        }
      }
      if (!want) {
        // Приоритет: pi-pine-light (новый дефолт) → user themes → pi-pine-windsurf → pi-pine-dark
        if (list.some((t) => t.name === "pi-pine-light")) {
          want = "pi-pine-light";
        } else {
          want =
            list.find((t) => !["pi-pine-dark", "pi-pine-windsurf", "pi-pine-light"].includes(t.name))?.name ||
            (list.some((t) => t.name === "pi-pine-windsurf") ? "pi-pine-windsurf" : "pi-pine-dark");
        }
      }
      const file = await readTheme(want).catch(() => null);
      if (file) {
        applyTheme(file);
        set({ current: want, file });
        localStorage.setItem(STORAGE_KEY, want);
      }
    } catch {
      // дефолтные стили уже применены
    }
  },

  async setTheme(name, persist = true) {
    try {
      const file = await readTheme(name);
      applyTheme(file);
      set({ current: name, file });
      if (persist) localStorage.setItem(STORAGE_KEY, name);
    } catch (e) {
      console.error(e);
    }
  },
}));
