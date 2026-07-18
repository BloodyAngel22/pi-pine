import { useEffect, useMemo, useRef, useState } from "react";
import { CopyPlus, Plus, X } from "@/components/ui/icons/compat";
import { Chip } from "@/components/ui/Chip";
import { useChat, type SessionTabState } from "@/store/chat";
import { cx as clsx } from "@/lib/cx";

function labelFor(tabId: string, name?: string | null): string {
  if (name?.trim()) return name.trim();
  return tabId === "session-1" ? "main" : tabId;
}

function projectName(cwd: string): string {
  const trimmed = cwd.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}

function indicatorClass(tab: ReturnType<typeof useChat.getState>["tabs"] extends Map<string, infer T> ? T : never): string {
  const state = tab.agentState;
  if (tab.pendingUserAction) return "bg-yellow-400 animate-pulse shadow-[0_0_8px_rgba(250,204,21,0.55)]";
  if (state?.isCompacting) return "bg-(--color-warn) animate-pulse";
  if (state?.isStreaming || state?.isRetrying) return "bg-(--color-accent) animate-pulse";
  if (tab.unseenAssistantCount > 0) return "bg-orange-400 animate-pulse";
  return "bg-(--color-fg-dim)";
}

function waitingLabel(kind: "permission" | "askUser"): string {
  return kind === "permission" ? "perm" : "ask";
}

export function SessionTabs() {
  const tabs = useChat((s) => s.tabs);
  const tabOrder = useChat((s) => s.tabOrder);
  const activeTabId = useChat((s) => s.activeTabId);
  const activateTab = useChat((s) => s.activateTab);
  const createSessionTab = useChat((s) => s.createSessionTab);
  const createForkTab = useChat((s) => s.createForkTab);
  const closeSessionTab = useChat((s) => s.closeSessionTab);
  const moveTabById = useChat((s) => s.moveTabById);
  const updateTab = useChat((s) => s.updateTab);
  const setSessionName = useChat((s) => s.setSessionName);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const tabsRef = useRef<HTMLDivElement | null>(null);

  const orderedTabs = useMemo(
    () =>
      tabOrder
        .map((id): SessionTabState | undefined => tabs.get(id))
        .filter((t): t is SessionTabState => Boolean(t)),
    [tabOrder, tabs],
  );

  // Бейдж проекта показываем только когда открыты табы из разных директорий —
  // иначе он дублировал бы cwd из статус-бара на каждом табе.
  const multiProject = useMemo(() => {
    const cwds = new Set(orderedTabs.map((t) => t.cwd).filter(Boolean));
    return cwds.size > 1;
  }, [orderedTabs]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F2" || !activeTabId) return;
      const active = tabs.get(activeTabId);
      if (!active) return;
      setRenaming(activeTabId);
      setDraft(labelFor(activeTabId, active.sessionName));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTabId, tabs]);

  const commitRename = async (tabId: string) => {
    const name = draft.trim();
    updateTab(tabId, { sessionName: name || null });
    setRenaming(null);
    // Персистим имя для ЛЮБОЙ реальной вкладки, а не только активной —
    // иначе переименование фоновой вкладки терялось при закрытии таба
    // (в файл сессии ничего не записывалось).
    if (name) {
      await setSessionName(name, tabId).catch(() => undefined);
    }
  };

  const onTabsWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = tabsRef.current;
    if (!el) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  };

  const onDropOnTab = (beforeTabId: string | null) => {
    if (!draggingTabId) return;
    moveTabById(draggingTabId, beforeTabId);
    setDraggingTabId(null);
    setDragOverTabId(null);
  };

  if (orderedTabs.length === 0) return null;

  return (
    <div className="h-9 shrink-0 min-w-0 flex items-center border-b border-(--color-border-muted) bg-(--color-bg-soft)">
      <div className="min-w-0 flex-1 h-full flex items-center">
        <div
          ref={tabsRef}
          onWheel={onTabsWheel}
          className="pi-session-tabs flex items-center gap-1 min-w-0 flex-1 overflow-x-hidden overflow-y-hidden px-2"
        >
      {orderedTabs.map((tab) => {
        const active = tab.tabId === activeTabId;
        return (
          <div
            key={tab.tabId}
            draggable={renaming !== tab.tabId}
            className={clsx(
              "group h-7 w-[220px] shrink-0 flex items-center gap-1.5 rounded-lg border px-2 text-xs select-none transition-colors",
              active
                ? "bg-(--color-bg) border-(--color-accent)/35 text-(--color-fg) shadow-sm"
                : "bg-transparent border-transparent text-(--color-fg-mute) hover:bg-(--color-bg-mute) hover:text-(--color-fg)",
              draggingTabId === tab.tabId && "opacity-50",
              dragOverTabId === tab.tabId && "ring-1 ring-(--color-accent) bg-(--color-accent-soft)/20",
              tab.pendingUserAction && "border-yellow-400/50",
            )}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", tab.tabId);
              setDraggingTabId(tab.tabId);
            }}
            onDragEnd={() => {
              setDraggingTabId(null);
              setDragOverTabId(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setDragOverTabId(tab.tabId);
            }}
            onDragLeave={() => setDragOverTabId((current) => current === tab.tabId ? null : current)}
            onDrop={(e) => {
              e.preventDefault();
              onDropOnTab(tab.tabId);
            }}
            onClick={() => void activateTab(tab.tabId)}
            onDoubleClick={() => {
              setRenaming(tab.tabId);
              setDraft(labelFor(tab.tabId, tab.sessionName));
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setRenaming(tab.tabId);
              setDraft(labelFor(tab.tabId, tab.sessionName));
            }}
            title={tab.cwd ? `${labelFor(tab.tabId, tab.sessionName)} — ${tab.cwd}` : labelFor(tab.tabId, tab.sessionName)}
          >
            <span className={clsx("h-2 w-2 rounded-full shrink-0", indicatorClass(tab))} />
            {renaming === tab.tabId ? (
              <input
                className="min-w-0 w-28 bg-transparent outline-none border-b border-(--color-accent)"
                value={draft}
                autoFocus
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => void commitRename(tab.tabId)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void commitRename(tab.tabId);
                  if (e.key === "Escape") setRenaming(null);
                }}
              />
            ) : (
              <span className="truncate min-w-0 flex-1">{labelFor(tab.tabId, tab.sessionName)}</span>
            )}
            {multiProject && tab.cwd && (
              <span className="max-w-[72px] shrink-0 truncate rounded bg-(--color-bg-mute) px-1 py-px text-[10px] text-(--color-fg-dim)">
                {projectName(tab.cwd)}
              </span>
            )}
            {tab.pendingUserAction && (
              <Chip
                size="xs"
                tone="warning"
                variant="mode"
                dot="warning"
                pulseDot
                title={tab.pendingUserAction.kind === "permission" ? "Ждёт permission" : "Ждёт ответ пользователя"}
              >
                {waitingLabel(tab.pendingUserAction.kind)}{tab.pendingUserAction.count > 1 ? `×${tab.pendingUserAction.count}` : ""}
              </Chip>
            )}
            {!active && tab.unseenAssistantCount > 0 && (
              <Chip size="xs" tone="warning" variant="health">
                {tab.unseenAssistantCount}
              </Chip>
            )}
            <button
              type="button"
              className="ml-auto opacity-0 group-hover:opacity-100 hover:text-(--color-danger) shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                void closeSessionTab(tab.tabId);
              }}
              title="Закрыть"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
        <div
          className="h-7 w-6 shrink-0"
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
          onDrop={(e) => { e.preventDefault(); onDropOnTab(null); }}
        />
        </div>
      </div>

      <div className="h-full shrink-0 flex items-center gap-1 border-l border-(--color-border-muted) bg-(--color-bg-soft) px-2 shadow-[-8px_0_12px_rgba(0,0,0,0.06)]">
        <button
          type="button"
          className="h-7 w-7 shrink-0 inline-flex items-center justify-center rounded-md text-(--color-fg-mute) hover:text-(--color-fg) hover:bg-(--color-bg-mute)"
          onClick={() => void createSessionTab()}
          title="Новая пустая сессия"
        >
          <Plus size={14} />
        </button>
        <button
          type="button"
          className="h-7 w-7 shrink-0 inline-flex items-center justify-center rounded-md text-(--color-fg-mute) hover:text-(--color-fg) hover:bg-(--color-bg-mute)"
          onClick={() => void createForkTab()}
          title="Новая сессия с памятью текущей"
        >
          <CopyPlus size={14} />
        </button>
      </div>
    </div>
  );
}
