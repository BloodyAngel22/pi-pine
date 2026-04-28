import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import * as rpc from "@/rpc/bridge";
import type { Model } from "@/rpc/types";

export interface FavoriteModel {
  provider: string;
  id: string;
}

interface ModelsState {
  available: Model[];
  favorites: FavoriteModel[];
  loadingAvailable: boolean;
  loadAvailable(): Promise<void>;
  loadFavorites(): Promise<void>;
  toggleFavorite(provider: string, id: string): Promise<void>;
  isFavorite(provider: string, id: string): boolean;
  setAsDefault(provider: string, id: string): Promise<void>;
}

export const useModels = create<ModelsState>((set, get) => ({
  available: [],
  favorites: [],
  loadingAvailable: false,

  async loadAvailable() {
    set({ loadingAvailable: true });
    try {
      const res = await rpc.getAvailableModels();
      const list = Array.isArray(res)
        ? res
        : (res as { models?: Model[] }).models ?? [];
      set({ available: list });
    } catch {
      // ignore
    } finally {
      set({ loadingAvailable: false });
    }
  },

  async loadFavorites() {
    try {
      const list = await invoke<FavoriteModel[]>("read_favorites");
      set({ favorites: Array.isArray(list) ? list : [] });
    } catch {
      // ignore
    }
  },

  isFavorite(provider, id) {
    return get().favorites.some((f) => f.provider === provider && f.id === id);
  },

  async toggleFavorite(provider, id) {
    const { favorites } = get();
    const exists = favorites.find(
      (f) => f.provider === provider && f.id === id,
    );
    const next = exists
      ? favorites.filter((f) => !(f.provider === provider && f.id === id))
      : [...favorites, { provider, id }];
    set({ favorites: next });
    await invoke("write_favorites", { items: next }).catch((e) => console.error(e));
  },

  async setAsDefault(provider, id) {
    await invoke("write_pi_settings_partial", {
      patch: { defaultProvider: provider, defaultModel: id },
    }).catch((e) => console.error(e));
  },
}));
