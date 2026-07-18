import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import clsx from "clsx";
import {
  Folder,
  Pin,
  Pencil,
  Trash2,
  MoreHorizontal,
  Search,
  ChevronRight,
  ChevronDown,
  MessageSquare,
  Send,
} from "@/components/ui/icons/compat";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useWorkspaces } from "@/store/workspaces";
import { useChat } from "@/store/chat";
import { useAgentsStore } from "@/store/agents";
import { t } from "@/i18n/ru";

interface SessionPreview {
  file: string;
  name?: string;
  first_user_text?: string;
  last_modified_secs: number;
}

interface Props {
  open: boolean;
  onClose(): void;
  /** Режим, в котором открывается оверлей (сбрасывается на этот режим при каждом открытии). */
  initialMode?: "recents" | "new";
}

function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}

/** Звезда-снежинка из логотипа Pi Pine — используется как декоративный watermark. */
function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 800 800" className={className} aria-hidden="true">
      <polygon
        fill="currentColor"
        points="408.28,305.36 490.59,61.93 440.15,313.9 458.49,325.14 580.31,219.69 474.86,341.51 486.1,359.85 738.07,309.41 494.64,391.72 494.08,413.22 646.31,466 488.08,435.59 477.82,454.49 647.49,647.49 454.49,477.82 435.59,488.08 466,646.31 413.22,494.08 391.72,494.64 309.41,738.07 359.85,486.1 341.51,474.86 219.69,580.31 325.14,458.49 313.9,440.15 61.93,490.59 305.36,408.28 305.92,386.78 153.69,334 311.92,364.41 322.18,345.51 152.51,152.51 345.51,322.18 364.41,311.92 334,153.69 386.78,305.92"
      />
    </svg>
  );
}

function formatRelative(unixSec: number): string {
  const diff = Date.now() / 1000 - unixSec;
  if (diff < 60) return "только что";
  if (diff < 3600) return `${Math.floor(diff / 60)} мин`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч`;
  return `${Math.floor(diff / 86400)} дн`;
}

export function WorkspaceOverlay({ open, onClose, initialMode }: Props) {
  const [mode, setMode] = useState<"recents" | "new">(initialMode ?? "recents");
  const [query, setQuery] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, SessionPreview[]>>({});
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [newPrompt, setNewPrompt] = useState("");
  const [newSessionName, setNewSessionName] = useState("");
  const [newPreset, setNewPreset] = useState("");
  const [starting, setStarting] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);

  const list = useWorkspaces((s) => s.list);
  const loadWorkspaces = useWorkspaces((s) => s.load);
  const removeWorkspace = useWorkspaces((s) => s.remove);
  const setPinned = useWorkspaces((s) => s.setPinned);
  const renameWorkspace = useWorkspaces((s) => s.rename);

  const cwd = useChat((s) => s.cwd);
  const createSessionTab = useChat((s) => s.createSessionTab);
  const send = useChat((s) => s.send);
  const openSessionTab = useChat((s) => s.openSessionTab);

  const presets = useAgentsStore((s) => s.presets);
  const loadPresets = useAgentsStore((s) => s.loadPresets);
  const selectPreset = useAgentsStore((s) => s.selectPreset);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setMenuFor(null);
      setExpanded(null);
      return;
    }
    setMode(initialMode ?? "recents");
    void loadWorkspaces();
    if (presets.length === 0) void loadPresets();
    setSelectedPath(cwd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialMode]);

  useEffect(() => {
    if (open && mode === "new") {
      const id = window.setTimeout(() => promptRef.current?.focus(), 30);
      return () => window.clearTimeout(id);
    }
  }, [open, mode]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((w) =>
      [w.display_name, w.path].filter(Boolean).some((v) => String(v).toLowerCase().includes(needle)),
    );
  }, [list, query]);

  const loadPreview = async (path: string) => {
    if (previews[path]) return;
    try {
      const sessions = await invoke<SessionPreview[]>("list_project_sessions", { cwd: path });
      setPreviews((prev) => ({ ...prev, [path]: sessions.slice(0, 5) }));
    } catch {
      setPreviews((prev) => ({ ...prev, [path]: [] }));
    }
  };

  const toggleExpand = (path: string) => {
    const next = expanded === path ? null : path;
    setExpanded(next);
    if (next) void loadPreview(next);
  };

  const pickFolder = async (defaultPath?: string): Promise<string | null> => {
    const r = await openDialog({ multiple: false, directory: true, defaultPath });
    return typeof r === "string" ? r : null;
  };

  // Per-tab cwd: проект открывается новым табом внутри работающего pi-процесса
  // (как в Claude Desktop) — без рестарта RPC и сброса остальных вкладок.
  const openWorkspace = async (path: string) => {
    onClose();
    const lastFile = await invoke<string | null>("read_last_session_file", { cwd: path }).catch(() => null);
    if (lastFile) {
      await openSessionTab(lastFile, null, true, path);
    } else {
      await createSessionTab(undefined, { cwd: path });
    }
  };

  const openWorkspaceSession = async (path: string, file: string, title: string) => {
    onClose();
    await openSessionTab(file, title, true, path);
  };

  const handleOpenFolder = async () => {
    const picked = await pickFolder(cwd);
    if (picked) void openWorkspace(picked);
  };

  const handlePickForNew = async () => {
    const picked = await pickFolder(selectedPath ?? cwd);
    if (picked) setSelectedPath(picked);
  };

  const handleStart = async () => {
    const path = selectedPath ?? cwd;
    if (!path) return;
    setStarting(true);
    try {
      const tabId = await createSessionTab(newSessionName.trim() || undefined, { cwd: path });
      if (!tabId) return;
      if (newPreset) {
        await selectPreset(newPreset, { sessionId: tabId, cwd: path }).catch(() => undefined);
      } else if (path !== cwd) {
        // Новый проект без явного пресета — проверяем авто-пресет его cwd.
        await useAgentsStore.getState().checkAutoPreset(path, { sessionId: tabId, force: true }).catch(() => null);
      }
      const prompt = newPrompt.trim();
      if (prompt) await send(prompt);
      setNewPrompt("");
      setNewSessionName("");
      setNewPreset("");
      onClose();
    } finally {
      setStarting(false);
    }
  };

  return (
    <Modal open={open} title={t.workspaces.title} onClose={onClose} width={mode === "new" ? "720px" : "640px"}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <SegmentedControl<"recents" | "new">
          ariaLabel={t.workspaces.title}
          value={mode}
          onChange={setMode}
          options={[
            { value: "recents", label: t.workspaces.tabRecents },
            { value: "new", label: t.workspaces.tabNew },
          ]}
        />
        {mode === "recents" && (
          <Button variant="subtle" size="sm" icon={<Folder size={13} />} onClick={() => void handleOpenFolder()}>
            {t.workspaces.openFolder}
          </Button>
        )}
      </div>

      {mode === "recents" && (
        <div>
          <label className="relative mb-3 block">
            <Search
              size={13}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-(--color-fg-dim)"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.workspaces.searchPlaceholder}
              className="pl-8"
            />
          </label>
          {filtered.length === 0 && (
            <div className="px-1 py-6 text-center text-xs text-(--color-fg-dim)">{t.workspaces.empty}</div>
          )}
          <div className="flex flex-col gap-1">
            {filtered.map((w) => {
              const isMenu = menuFor === w.path;
              const isExpanded = expanded === w.path;
              const title = w.display_name || basename(w.path);
              const isActive = w.path === cwd;
              const rowPreviews = previews[w.path];
              return (
                <div key={w.path} className="rounded-lg border border-(--color-border)/60">
                  <div
                    className={clsx(
                      "group flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-xs",
                      isActive ? "bg-(--color-accent-soft)/30" : "hover:bg-(--color-bg-mute)",
                    )}
                    onClick={() => {
                      if (isMenu) return;
                      void openWorkspace(w.path);
                    }}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpand(w.path);
                      }}
                      className="shrink-0 text-(--color-fg-dim) hover:text-(--color-fg)"
                    >
                      {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </button>
                    <Folder size={13} className="shrink-0 text-(--color-fg-mute)" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 truncate font-medium">
                        {title}
                        {w.pinned && <Pin size={10} className="shrink-0 text-(--color-accent)" />}
                      </div>
                      <div className="truncate text-(--color-fg-dim)">{w.path}</div>
                    </div>
                    <span className="shrink-0 text-(--color-fg-dim)">{formatRelative(w.last_used_ms / 1000)}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuFor(isMenu ? null : w.path);
                      }}
                      className="shrink-0 p-0.5 text-(--color-fg-dim) opacity-0 hover:text-(--color-fg) group-hover:opacity-100"
                    >
                      <MoreHorizontal size={13} />
                    </button>
                  </div>
                  {isMenu && (
                    <div
                      className="border-t border-(--color-border)/60 px-1 py-1 text-xs"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MenuItem
                        icon={<Pin size={11} />}
                        label={w.pinned ? t.workspaces.unpin : t.workspaces.pin}
                        onClick={() => {
                          setMenuFor(null);
                          void setPinned(w.path, !w.pinned);
                        }}
                      />
                      <MenuItem
                        icon={<Pencil size={11} />}
                        label={t.workspaces.rename}
                        onClick={() => {
                          setMenuFor(null);
                          const next = prompt(t.workspaces.renamePrompt, w.display_name || basename(w.path));
                          if (next == null) return;
                          void renameWorkspace(w.path, next.trim() || null);
                        }}
                      />
                      <MenuItem
                        icon={<Trash2 size={11} />}
                        label={t.workspaces.remove}
                        danger
                        onClick={() => {
                          setMenuFor(null);
                          void removeWorkspace(w.path);
                        }}
                      />
                    </div>
                  )}
                  {isExpanded && (
                    <div className="border-t border-(--color-border)/60 px-1 py-1">
                      {!rowPreviews && <div className="px-2 py-1.5 text-[11px] text-(--color-fg-dim)">…</div>}
                      {rowPreviews?.length === 0 && (
                        <div className="px-2 py-1.5 text-[11px] text-(--color-fg-dim)">{t.sessions.empty}</div>
                      )}
                      {rowPreviews?.map((s) => {
                        const sTitle =
                          s.name || (s.first_user_text ? s.first_user_text.split("\n")[0] : t.sessions.untitled);
                        return (
                          <button
                            key={s.file}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void openWorkspaceSession(w.path, s.file, sTitle);
                            }}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] hover:bg-(--color-bg-mute)"
                          >
                            <MessageSquare size={11} className="shrink-0 text-(--color-fg-mute)" />
                            <span className="min-w-0 flex-1 truncate">{sTitle}</span>
                            <span className="shrink-0 text-(--color-fg-dim)">{formatRelative(s.last_modified_secs)}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {mode === "new" && (
        <div className="relative flex flex-col items-center px-2 pb-2 pt-6">
          <LogoMark className="pointer-events-none absolute top-0 h-56 w-56 text-(--color-fg) opacity-[0.05]" />
          <h2 className="relative z-10 mb-5 text-center font-serif text-[26px] font-medium tracking-tight text-(--color-fg)">
            {t.workspaces.heroPrefix}{" "}
            <span className="text-(--color-accent)">{basename(selectedPath || cwd)}</span>
          </h2>

          <div className="relative z-10 w-full rounded-2xl border border-(--color-border) bg-(--color-bg-soft) shadow-[0_20px_60px_-28px_rgba(0,0,0,0.5)]">
            <div className="flex items-center gap-2 border-b border-(--color-border-muted) px-3 py-2.5">
              <button
                type="button"
                onClick={() => void handlePickForNew()}
                className="inline-flex items-center gap-1.5 rounded-full border border-(--color-border) bg-(--color-bg-mute) px-2.5 py-1 text-xs font-medium text-(--color-fg) hover:bg-(--color-bg)"
              >
                <Folder size={12} className="text-(--color-fg-mute)" />
                {basename(selectedPath || cwd)}
                <ChevronDown size={11} className="text-(--color-fg-dim)" />
              </button>
              <div className="flex-1" />
              <input
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                placeholder={t.workspaces.sessionNamePlaceholder}
                className="w-40 bg-transparent text-right text-xs text-(--color-fg-dim) placeholder:text-(--color-fg-dim)/70 outline-none"
              />
            </div>

            <textarea
              ref={promptRef}
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleStart();
                }
              }}
              placeholder={t.workspaces.promptPlaceholder}
              rows={6}
              className="w-full resize-none bg-transparent px-4 py-3.5 text-sm text-(--color-fg) placeholder:text-(--color-fg-dim) outline-none"
            />

            <div className="flex items-center justify-between gap-2 border-t border-(--color-border-muted) px-3 py-2.5">
              {presets.length > 0 ? (
                <select
                  value={newPreset}
                  onChange={(e) => setNewPreset(e.target.value)}
                  className="h-7 rounded-full border border-(--color-border) bg-(--color-bg-mute) px-2.5 text-xs text-(--color-fg) outline-none hover:bg-(--color-bg)"
                >
                  <option value="">{t.workspaces.presetNone}</option>
                  {presets.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span />
              )}
              <button
                type="button"
                disabled={!selectedPath || starting}
                onClick={() => void handleStart()}
                title={t.workspaces.start}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-(--color-accent) text-white shadow-sm transition-colors hover:bg-(--color-accent)/90 disabled:opacity-40"
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick(): void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-(--color-bg-mute)",
        danger && "text-(--color-danger)",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
