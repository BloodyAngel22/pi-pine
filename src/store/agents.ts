import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import * as rpc from "@/rpc/bridge";
import type { AgentPresetConfig } from "@/rpc/types";

interface SelectOptions {
  sessionId?: string | null;
  auto?: boolean;
  cwd?: string | null;
}

const STORAGE_KEY_LAST_PRESET_PREFIX = "pi-pine.lastPreset.";

function lastPresetStorageKey(cwd: string): string {
  return `${STORAGE_KEY_LAST_PRESET_PREFIX}${cwd}`;
}

function rememberLastPreset(cwd: string | null | undefined, name: string): void {
  if (!cwd) return;
  localStorage.setItem(lastPresetStorageKey(cwd), name);
}

function forgetLastPreset(cwd: string | null | undefined): void {
  if (!cwd) return;
  localStorage.removeItem(lastPresetStorageKey(cwd));
}

function getLastPreset(cwd: string): string | null {
  return localStorage.getItem(lastPresetStorageKey(cwd));
}

interface AgentsState {
  presets: AgentPresetConfig[];
  activePreset: string | null;
  loading: boolean;
  error: string | null;
  /** Пользователь явно выбрал пресет; автозагрузка не должна перетирать этот выбор. */
  manualPresetSelected: boolean;
  loadPresets(): Promise<void>;
  ensureDefault(): Promise<void>;
  selectPreset(name: string, options?: SelectOptions): Promise<void>;
  createPreset(config: AgentPresetConfig): Promise<void>;
  updatePreset(config: AgentPresetConfig, sessionId?: string | null): Promise<void>;
  deletePreset(name: string): Promise<void>;
  clearPreset(cwd?: string | null): void;
  checkAutoPreset(cwd: string, options?: { sessionId?: string | null; force?: boolean }): Promise<string | null>;
}

function normalizePreset(config: AgentPresetConfig): AgentPresetConfig {
  return {
    ...config,
    description: config.description ?? "",
    model: config.model ?? null,
    permissions: config.permissions ?? { bash: "ask", files: "ask" },
    mcpPermissions: config.mcpPermissions ?? { mode: "ask" },
    autoRetry: config.autoRetry ?? true,
    autoCompaction: config.autoCompaction ?? true,
    steeringMode: config.steeringMode ?? "all",
    followUpMode: config.followUpMode ?? "all",
    projectCwd: config.projectCwd || null,
  };
}

export const useAgentsStore = create<AgentsState>((set, get) => ({
  presets: [],
  activePreset: null,
  loading: false,
  error: null,
  manualPresetSelected: false,

  async loadPresets() {
    set({ loading: true, error: null });
    try {
      const presets = await invoke<AgentPresetConfig[]>("list_agent_presets");
      set({ presets: presets.map(normalizePreset), loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  async ensureDefault() {
    try {
      await invoke("ensure_default_preset");
      await get().loadPresets();
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  async selectPreset(name, options) {
    const previousActivePreset = get().activePreset;
    const previousManualPresetSelected = get().manualPresetSelected;
    const nextManualPresetSelected = !options?.auto;

    // Оптимистически обновляем UI: Mantine Select в RunSettings управляется
    // activePreset, поэтому без этого он визуально остаётся на старом значении
    // до конца RPC-запроса (или навсегда, если apply упал).
    set({
      activePreset: name,
      manualPresetSelected: nextManualPresetSelected,
      loading: true,
      error: null,
    });
    try {
      await rpc.loadAgentPreset(name, options?.sessionId);
      set({ activePreset: name, manualPresetSelected: nextManualPresetSelected, loading: false });
      // Запоминаем ручной выбор пресета per-cwd, чтобы восстановить его при
      // следующем запуске приложения (см. checkAutoPreset) — без этого
      // старт всегда откатывался на project_cwd-маппинг или "default".
      if (nextManualPresetSelected) rememberLastPreset(options?.cwd, name);
    } catch (e) {
      set({
        activePreset: previousActivePreset,
        manualPresetSelected: previousManualPresetSelected,
        error: (e as Error).message,
        loading: false,
      });
      throw e;
    }
  },

  async createPreset(config) {
    set({ loading: true, error: null });
    try {
      await invoke("write_agent_preset", { preset: normalizePreset(config) });
      await get().loadPresets();
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      throw e;
    }
  },

  async updatePreset(config, sessionId) {
    set({ loading: true, error: null });
    try {
      const normalized = normalizePreset(config);
      await invoke("write_agent_preset", { preset: normalized });
      await get().loadPresets();
      if (get().activePreset === normalized.name) {
        await get().selectPreset(normalized.name, { sessionId, auto: !get().manualPresetSelected });
      }
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      throw e;
    }
  },

  async deletePreset(name) {
    set({ loading: true, error: null });
    try {
      await invoke("delete_agent_preset", { name });
      await get().loadPresets();
      if (get().activePreset === name) {
        set({ activePreset: null, manualPresetSelected: false });
      }
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      throw e;
    }
  },

  clearPreset(cwd) {
    forgetLastPreset(cwd);
    set({ activePreset: null, manualPresetSelected: false, error: null });
  },

  async checkAutoPreset(cwd, options) {
    if (!options?.force && get().manualPresetSelected) return null;
    try {
      const mappedName = await invoke<string | null>("get_preset_for_cwd", { cwd });
      const remembered = getLastPreset(cwd);
      const rememberedName =
        remembered && get().presets.some((preset) => preset.name === remembered) ? remembered : null;
      const fallbackName = get().presets.some((preset) => preset.name === "default") ? "default" : null;
      // Приоритет: явный project_cwd-маппинг пресета > последний вручную
      // выбранный пресет для этой директории > "default".
      const name = mappedName ?? rememberedName ?? fallbackName;
      if (name && name !== get().activePreset) {
        await get().selectPreset(name, { sessionId: options?.sessionId, auto: true });
      } else if (!name) {
        set({ activePreset: null, manualPresetSelected: false });
      }
      return name;
    } catch (e) {
      set({ error: (e as Error).message });
      return null;
    }
  },
}));
