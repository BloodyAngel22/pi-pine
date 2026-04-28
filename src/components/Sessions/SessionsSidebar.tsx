import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plus, RefreshCw, Trash2, MessageSquare, MoreHorizontal, GitFork, Copy as CopyIcon, Pencil, Download } from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { useChat } from "@/store/chat";
import { useUiPrefs } from "@/store/uiPrefs";
import { useResize } from "@/lib/useResize";
import { SESSIONS_MIN, SESSIONS_MAX } from "@/store/uiPrefs";
import { t } from "@/i18n/ru";
import * as rpc from "@/rpc/bridge";

interface SessionInfo {
  file: string;
  session_id: string;
  timestamp?: string;
  cwd?: string;
  name?: string;
  message_count: number;
  first_user_text?: string;
  last_modified_secs: number;
  size_bytes: number;
}

function formatRelative(unixSec: number): string {
  const diff = Date.now() / 1000 - unixSec;
  if (diff < 60) return "только что";
  if (diff < 3600) return `${Math.floor(diff / 60)} мин`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч`;
  return `${Math.floor(diff / 86400)} дн`;
}

type Bucket = "Сегодня" | "Вчера" | "Эта неделя" | "Раньше";
function bucketOf(unixSec: number): Bucket {
  const now = Date.now() / 1000;
  const diff = now - unixSec;
  if (diff < 86_400) return "Сегодня";
  if (diff < 86_400 * 2) return "Вчера";
  if (diff < 86_400 * 7) return "Эта неделя";
  return "Раньше";
}

export function SessionsSidebar({ onClose }: { onClose: () => void }) {
  const cwd = useChat((s) => s.cwd);
  const switchSession = useChat((s) => s.switchSession);
  const newSession = useChat((s) => s.newSession);
  const setSessionName = useChat((s) => s.setSessionName);
  const agentSessionFile = useChat((s) => s.agentState?.sessionFile);
  const switching = useChat((s) => s.switching);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const list = await invoke<SessionInfo[]>("list_project_sessions", { cwd });
      setSessions(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd, agentSessionFile]);

  // закрытие меню по клику вне
  useEffect(() => {
    if (!menuFor) return;
    const onDoc = () => setMenuFor(null);
    window.addEventListener("click", onDoc);
    return () => window.removeEventListener("click", onDoc);
  }, [menuFor]);

  const remove = async (file: string) => {
    if (!confirm(t.sessions.confirmDelete)) return;
    try {
      await invoke("delete_session_file", { file });
      void reload();
    } catch (e) {
      alert(String(e));
    }
  };

  const renameSession = async (s: SessionInfo) => {
    const next = prompt("Новое имя сессии", s.name || "");
    if (next == null) return;
    const trimmed = next.trim();
    if (!trimmed) return;
    try {
      // Для активной сессии дополнительно сообщаем pi (чтобы sessionName в RPC был в синхре).
      if (s.file === agentSessionFile) {
        await setSessionName(trimmed);
      }
      // В любом случае пишем имя в файл сессии (персистит для любой сессии, в т.ч. неактивной).
      await invoke("rename_session_file", { file: s.file, name: trimmed });
    } catch (e) {
      alert(String(e));
    }
    void reload();
  };

  const cloneSession = async () => {
    try {
      await rpc.clone();
      await useChat.getState().refreshState();
      await useChat.getState().reloadHistory();
      void reload();
    } catch (e) {
      alert(String(e));
    }
  };

  const exportHtml = async () => {
    try {
      const r = await rpc.exportHtml();
      alert(`Экспортировано: ${r.path}`);
    } catch (e) {
      alert(String(e));
    }
  };

  const groups = useMemo(() => {
    const m: Record<Bucket, SessionInfo[]> = {
      Сегодня: [],
      Вчера: [],
      "Эта неделя": [],
      Раньше: [],
    };
    for (const s of sessions) m[bucketOf(s.last_modified_secs)].push(s);
    return m;
  }, [sessions]);

  const sessionsWidth = useUiPrefs((s) => s.sessionsWidth);
  const setSessionsWidth = useUiPrefs((s) => s.setSessionsWidth);
  const resize = useResize({
    edge: "right",
    initial: sessionsWidth,
    min: SESSIONS_MIN,
    max: SESSIONS_MAX,
    onChange: setSessionsWidth,
  });

  return (
    <aside
      className="shrink-0 border-r border-(--color-border) bg-(--color-bg-soft) flex flex-col relative"
      style={{ width: sessionsWidth }}
    >
      <div
        className={clsx("pi-resizer pi-resizer-right", resize.active && "pi-resizer-active")}
        onMouseDown={resize.onMouseDown}
      />
      <div className="px-3 py-2 border-b border-(--color-border) flex items-center gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-(--color-fg-mute) flex-1">
          {t.sessions.title}
        </span>
        <Button variant="ghost" size="sm" onClick={() => void reload()} icon={<RefreshCw size={12} />} />
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await newSession();
            onClose();
          }}
          icon={<Plus size={12} />}
        >
          {t.sessions.new}
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading && <div className="px-3 py-2 text-xs text-(--color-fg-dim)">…</div>}
        {!loading && sessions.length === 0 && (
          <div className="px-3 py-3 text-xs text-(--color-fg-dim)">
            {t.sessions.empty}
          </div>
        )}
        {(Object.keys(groups) as Bucket[]).map((bucket) => {
          const items = groups[bucket];
          if (items.length === 0) return null;
          return (
            <div key={bucket}>
              <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider font-semibold text-(--color-fg-dim)">
                {bucket}
              </div>
              {items.map((s) => {
                const active = agentSessionFile && s.file === agentSessionFile;
                const title =
                  s.name ||
                  (s.first_user_text ? s.first_user_text.split("\n")[0] : t.sessions.untitled);
                const isMenu = menuFor === s.file;
                return (
                  <div
                    key={s.file}
                    className={clsx(
                      "group px-3 py-2 border-b border-(--color-border)/40 text-xs relative",
                      active ? "bg-(--color-accent-soft)/30" : "hover:bg-(--color-bg-mute)",
                      switching || active ? "cursor-default" : "cursor-pointer",
                      switching && !active && "opacity-50 pointer-events-none",
                    )}
                    onClick={() => {
                      if (isMenu) return;
                      if (switching) return;
                      if (active) {
                        onClose();
                        return;
                      }
                      // 1) сразу закрываем сайдбар — пользователь видит мгновенный отклик
                      // 2) запускаем switch в фоне (не await), store сам поставит switching=true
                      onClose();
                      void switchSession(s.file);
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <MessageSquare size={12} className="mt-0.5 shrink-0 text-(--color-fg-mute)" />
                      <div className="flex-1 min-w-0">
                        <div className="truncate font-medium">{title}</div>
                        <div className="flex gap-2 text-(--color-fg-dim) mt-0.5">
                          <span>{formatRelative(s.last_modified_secs)}</span>
                          <span>·</span>
                          <span>{s.message_count} сообщ.</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuFor(isMenu ? null : s.file);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-(--color-fg-dim) hover:text-(--color-fg) p-0.5"
                      >
                        <MoreHorizontal size={12} />
                      </button>
                    </div>
                    {isMenu && (
                      <div
                        className="absolute right-2 top-7 z-10 bg-(--color-bg-soft) border border-(--color-border) rounded-md shadow-xl text-xs py-1 min-w-[160px]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MenuItem
                          icon={<Pencil size={11} />}
                          label="Переименовать"
                          onClick={() => {
                            setMenuFor(null);
                            void renameSession(s);
                          }}
                        />
                        {active && (
                          <>
                            <MenuItem
                              icon={<CopyIcon size={11} />}
                              label="Клонировать"
                              onClick={() => {
                                setMenuFor(null);
                                void cloneSession();
                              }}
                            />
                            <MenuItem
                              icon={<Download size={11} />}
                              label="Экспорт HTML"
                              onClick={() => {
                                setMenuFor(null);
                                void exportHtml();
                              }}
                            />
                          </>
                        )}
                        <MenuItem
                          icon={<GitFork size={11} />}
                          label="Открыть"
                          onClick={() => {
                            setMenuFor(null);
                            onClose();
                            void switchSession(s.file);
                          }}
                        />
                        <div className="my-1 border-t border-(--color-border)" />
                        <MenuItem
                          icon={<Trash2 size={11} />}
                          label="Удалить файл"
                          danger
                          onClick={() => {
                            setMenuFor(null);
                            void remove(s.file);
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </aside>
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
        "w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-(--color-bg-mute)",
        danger && "text-(--color-danger)",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
