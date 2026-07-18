import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export interface WorkspaceEntry {
  path: string;
  display_name: string | null;
  last_used_ms: number;
  pinned: boolean;
}

interface WorkspacesState {
  list: WorkspaceEntry[];
  loading: boolean;
  load(): Promise<void>;
  touch(path: string): Promise<WorkspaceEntry | null>;
  remove(path: string): Promise<void>;
  setPinned(path: string, pinned: boolean): Promise<void>;
  rename(path: string, displayName: string | null): Promise<void>;
}

export const useWorkspaces = create<WorkspacesState>((set, get) => ({
  list: [],
  loading: false,

  async load() {
    set({ loading: true });
    try {
      const list = await invoke<WorkspaceEntry[]>("list_workspaces");
      set({ list });
    } catch {
      // оставляем предыдущий список
    } finally {
      set({ loading: false });
    }
  },

  async touch(path) {
    try {
      const entry = await invoke<WorkspaceEntry>("touch_workspace", { path });
      await get().load();
      return entry;
    } catch {
      return null;
    }
  },

  async remove(path) {
    try {
      await invoke("remove_workspace", { path });
      set((state) => ({ list: state.list.filter((w) => w.path !== path) }));
    } catch {
      // ignore
    }
  },

  async setPinned(path, pinned) {
    try {
      await invoke("set_workspace_pinned", { path, pinned });
      set((state) => ({
        list: state.list.map((w) => (w.path === path ? { ...w, pinned } : w)),
      }));
    } catch {
      // ignore
    }
  },

  async rename(path, displayName) {
    try {
      await invoke("rename_workspace", { path, displayName });
      set((state) => ({
        list: state.list.map((w) => (w.path === path ? { ...w, display_name: displayName } : w)),
      }));
    } catch {
      // ignore
    }
  },
}));
