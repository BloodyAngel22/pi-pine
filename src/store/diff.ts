import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { onEvent } from "@/rpc/bridge";
import { useChat } from "@/store/chat";

export type FileStatus = "modified" | "added" | "deleted" | "renamed" | "copied" | "untracked";

export interface ChangedFile {
  path: string;
  oldPath?: string | null;
  status: FileStatus;
  binary: boolean;
  staged: boolean;
  additions: number;
  deletions: number;
  diff: string;
}

interface GitDiffResult {
  isRepo: boolean;
  repoRoot: string | null;
  files: ChangedFile[];
}

interface FileDiffResult {
  diff: string;
  binary: boolean;
}

interface FullDiffEntry {
  diff: string;
  binary: boolean;
  loading: boolean;
  error: string | null;
}

interface DiffState {
  isRepo: boolean;
  repoRoot: string | null;
  files: ChangedFile[];
  selectedPath: string | null;
  loading: boolean;
  error: string | null;
  fullDiffCache: Record<string, FullDiffEntry>;
  /** Панель Diff видна пользователю (mainTab === "diff" в App.tsx). */
  panelOpen: boolean;

  init(): void;
  setPanelOpen(open: boolean): void;
  refresh(): Promise<void>;
  selectFile(path: string | null): void;
  selectNextFile(): void;
  selectPrevFile(): void;
  loadFullDiff(path: string): Promise<void>;
}

let initialized = false;

export const useDiff = create<DiffState>((set, get) => ({
  isRepo: true,
  repoRoot: null,
  files: [],
  selectedPath: null,
  loading: false,
  error: null,
  fullDiffCache: {},
  panelOpen: false,

  init() {
    if (initialized) return;
    initialized = true;
    onEvent((event) => {
      // git status/diff (включая полный -U100000 диф выбранного файла) не бесплатны —
      // считаем их только пока панель реально видна, а не на каждый ход агента.
      if ((event as { type?: unknown }).type === "turn_end" && get().panelOpen) {
        void get().refresh();
      }
    });
  },

  setPanelOpen(open) {
    set({ panelOpen: open });
  },

  async refresh() {
    if (get().loading) return;
    set({ loading: true, error: null });
    const cwd = useChat.getState().cwd;
    try {
      const result = await invoke<GitDiffResult>("git_diff_status", { cwd, contextLines: 8 });
      const prevSelected = get().selectedPath;
      const stillExists = prevSelected != null && result.files.some((f) => f.path === prevSelected);
      const nextSelected = stillExists ? prevSelected : (result.files[0]?.path ?? null);
      set({
        isRepo: result.isRepo,
        repoRoot: result.repoRoot,
        files: result.files,
        selectedPath: nextSelected,
        loading: false,
        fullDiffCache: {},
      });
      if (nextSelected) void get().loadFullDiff(nextSelected);
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  selectFile(path) {
    set({ selectedPath: path });
    if (path) void get().loadFullDiff(path);
  },

  async loadFullDiff(path) {
    const file = get().files.find((f) => f.path === path);
    if (!file || file.binary) return;
    const existing = get().fullDiffCache[path];
    if (existing && !existing.error) return;
    set((s) => ({ fullDiffCache: { ...s.fullDiffCache, [path]: { diff: "", binary: false, loading: true, error: null } } }));
    const cwd = useChat.getState().cwd;
    try {
      const result = await invoke<FileDiffResult>("git_diff_file", { cwd, path, untracked: file.status === "untracked" });
      set((s) => ({
        fullDiffCache: { ...s.fullDiffCache, [path]: { diff: result.diff, binary: result.binary, loading: false, error: null } },
      }));
    } catch (e) {
      set((s) => ({
        fullDiffCache: { ...s.fullDiffCache, [path]: { diff: "", binary: false, loading: false, error: String(e) } },
      }));
    }
  },

  selectNextFile() {
    const { files, selectedPath } = get();
    if (files.length === 0) return;
    const idx = files.findIndex((f) => f.path === selectedPath);
    const next = files[(idx + 1) % files.length];
    get().selectFile(next.path);
  },

  selectPrevFile() {
    const { files, selectedPath } = get();
    if (files.length === 0) return;
    const idx = files.findIndex((f) => f.path === selectedPath);
    const prev = files[(idx - 1 + files.length) % files.length];
    get().selectFile(prev.path);
  },
}));

/** Активный текст диффа: полный (когда уже загружен), иначе — лёгкий fallback с ограниченным контекстом. */
export function useActiveDiffText(file: ChangedFile | null): { text: string; loading: boolean } {
  const entry = useDiff((s) => (file ? s.fullDiffCache[file.path] : undefined));
  if (!file) return { text: "", loading: false };
  if (entry && !entry.loading && !entry.error) return { text: entry.diff, loading: false };
  return { text: file.diff, loading: entry?.loading ?? false };
}
