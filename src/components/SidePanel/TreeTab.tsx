import { useEffect, useMemo, useState } from "react";
import { Bot, FileWarning, GitBranch, MessageSquare, Navigation, RefreshCw, RotateCcw } from "@/components/ui/icons/compat";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import * as rpc from "@/rpc/bridge";
import { useChat } from "@/store/chat";

interface FlatNode {
  node: rpc.SessionTreeNode;
  depth: number;
  siblingIndex: number;
  siblingCount: number;
  text: string;
}

interface DisplayNode extends FlatNode {
  displayDepth: number;
}

type TreeMode = "compact" | "raw";

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (content && typeof content === "object" && "content" in content) {
    return messageText((content as { content?: unknown }).content);
  }
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (!part || typeof part !== "object") return "";
      const p = part as Record<string, unknown>;
      if (typeof p.text === "string") return p.text;
      if (typeof p.name === "string") return `[${p.name}]`;
      if (typeof p.type === "string") return `[${p.type}]`;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function entryRole(entry: rpc.SessionTreeEntry): string | null {
  return entry.type === "message" ? String(entry.message?.role ?? "") || null : null;
}

function entryText(entry: rpc.SessionTreeEntry): string {
  if (entry.type === "message" && entry.message) return messageText(entry.message);
  if (entry.type === "custom_message") return messageText(entry.content);
  if (typeof entry.summary === "string") return entry.summary;
  if (entry.type === "model_change") return `${entry.provider ?? "provider"}/${entry.modelId ?? "model"}`;
  if (entry.type === "thinking_level_change") return `thinking: ${entry.thinkingLevel ?? ""}`;
  if (entry.type === "session_info") return `session: ${entry.name ?? ""}`;
  if (entry.type === "label") return `label: ${entry.label ?? ""}`;
  if (entry.customType) return entry.customType;
  return entry.id;
}

function compactText(text: string, max = 160): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

function flattenTree(nodes: rpc.SessionTreeNode[], depth = 0): FlatNode[] {
  const out: FlatNode[] = [];
  nodes.forEach((node, index) => {
    out.push({
      node,
      depth,
      siblingIndex: index,
      siblingCount: nodes.length,
      text: entryText(node.entry),
    });
    out.push(...flattenTree(node.children, depth + 1));
  });
  return out;
}

function hasAssistantBeforeNextUser(node: rpc.SessionTreeNode): boolean {
  for (const child of node.children) {
    const role = entryRole(child.entry);
    if (role === "user") continue;
    if (role === "assistant") return true;
    if (hasAssistantBeforeNextUser(child)) return true;
  }
  return false;
}

function isCompactVisible(item: FlatNode, leafId: string | null): boolean {
  const entry = item.node.entry;
  const role = entryRole(entry);
  if (entry.id === leafId) return true;
  if (role === "user") return true;
  if (role === "assistant" && !hasAssistantBeforeNextUser(item.node)) return true;
  if (item.node.children.length > 1) return true;
  if (entry.type === "label" || item.node.label || typeof entry.summary === "string") return true;
  return false;
}

function shortPath(path: string): string {
  const home = useChat.getState().home;
  return home && path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

export function TreeTab() {
  const reloadHistory = useChat((s) => s.reloadHistory);
  const refreshState = useChat((s) => s.refreshState);
  const clearMessages = useChat((s) => s.clearMessages);
  const injectComposer = useChat((s) => s.injectComposer);
  const setError = useChat((s) => s.setError);
  const sessionKey = useChat((s) => {
    const activeTab = s.tabs.get(s.activeTabId ?? "");
    const agentState = activeTab?.agentState ?? s.agentState;
    const messageCount = activeTab?.messages.length ?? s.messages.length;
    return `${s.generation}:${agentState?.sessionFile ?? agentState?.sessionId ?? ""}:${messageCount}`;
  });
  const [tree, setTree] = useState<rpc.SessionTreeNode[]>([]);
  const [leafId, setLeafId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checkpoint, setCheckpoint] = useState<rpc.FileCheckpointStatus | null>(null);
  const [turnCheckpoint, setTurnCheckpoint] = useState<rpc.FileCheckpointStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [result, setResult] = useState<rpc.FileCheckpointRestoreResult | null>(null);
  const [mode, setMode] = useState<TreeMode>("compact");

  const flatNodes = useMemo(() => flattenTree(tree), [tree]);
  const entryById = useMemo(() => new Map(flatNodes.map((item) => [item.node.entry.id, item.node.entry])), [flatNodes]);
  const activeBranch = useMemo(() => {
    const ids: string[] = [];
    let current = leafId ? entryById.get(leafId) : undefined;
    while (current) {
      ids.unshift(current.id);
      current = current.parentId ? entryById.get(current.parentId) : undefined;
    }
    return ids;
  }, [entryById, leafId]);
  const activeIds = useMemo(() => new Set(activeBranch), [activeBranch]);
  const displayNodes = useMemo<DisplayNode[]>(() => {
    const base = mode === "raw" ? flatNodes : flatNodes.filter((item) => isCompactVisible(item, leafId));
    const visibleIds = new Set(base.map((item) => item.node.entry.id));
    return base.map((item) => {
      let displayDepth = 0;
      let parentId = item.node.entry.parentId;
      while (parentId) {
        if (visibleIds.has(parentId)) displayDepth += 1;
        parentId = entryById.get(parentId)?.parentId ?? null;
      }
      return { ...item, displayDepth };
    });
  }, [entryById, flatNodes, leafId, mode]);
  const selected = flatNodes.find((item) => item.node.entry.id === selectedId) ?? null;
  const selectedTurnIndex = selected ? activeBranch.indexOf(selected.node.entry.id) : -1;
  const canRestoreSelected = selectedTurnIndex >= 0;
  const hiddenCount = Math.max(0, flatNodes.length - displayNodes.length);

  const reload = async () => {
    setLoading(true);
    try {
      const [treeRes, checkpointRes] = await Promise.all([
        rpc.getSessionTree(),
        rpc.getFileCheckpointStatus().catch(() => null),
      ]);
      const nextFlat = flattenTree(treeRes.tree);
      setTree(treeRes.tree);
      setLeafId(treeRes.leafId);
      setCheckpoint(checkpointRes);
      setSelectedId((current) => current ?? treeRes.leafId ?? nextFlat.find((item) => entryRole(item.node.entry) === "user")?.node.entry.id ?? nextFlat[0]?.node.entry.id ?? null);
    } catch (error) {
      setError(String(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, [sessionKey]);

  useEffect(() => {
    if (!canRestoreSelected) {
      setTurnCheckpoint(null);
      return;
    }
    void rpc.getFileCheckpointTurnStatus(selectedTurnIndex).then(setTurnCheckpoint).catch(() => setTurnCheckpoint(null));
  }, [canRestoreSelected, selectedTurnIndex]);

  const navigate = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      const entry = selected.node.entry;
      const useComposer = entry.type === "message" && entry.message?.role === "user";
      const res = await rpc.navigateTree(entry.id, useComposer ? undefined : { exact: true });
      if (res.cancelled) return;
      clearMessages();
      await refreshState().catch(() => undefined);
      await reloadHistory().catch(() => undefined);
      if (res.editorText) injectComposer(res.editorText);
      await reload();
    } catch (error) {
      setError(String(error));
    } finally {
      setLoading(false);
    }
  };

  const restore = async () => {
    if (!selected || !canRestoreSelected) return;
    const status = turnCheckpoint ?? checkpoint;
    const count = (status?.modified.length ?? 0) + (status?.created.length ?? 0);
    const ok = window.confirm(
      count > 0
        ? `Восстановить файлы к выбранной точке? Будет затронуто файлов: ${count}`
        : "Checkpoint для выбранной точки пуст. Всё равно попробовать restore?",
    );
    if (!ok) return;
    setRestoring(true);
    try {
      const restoreResult = await rpc.restoreFileChangesToTurn(selectedTurnIndex);
      setResult(restoreResult);
      await reload();
    } catch (error) {
      setError(String(error));
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="p-3 space-y-3 text-xs min-w-0">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" icon={<RefreshCw size={11} />} onClick={() => void reload()} disabled={loading}>
          Обновить
        </Button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setMode("compact")}
          className={clsx("px-2 py-1 rounded text-[10px]", mode === "compact" ? "bg-(--color-accent-soft) text-(--color-accent)" : "text-(--color-fg-dim) hover:bg-(--color-bg-mute)")}
        >
          Compact
        </button>
        <button
          type="button"
          onClick={() => setMode("raw")}
          className={clsx("px-2 py-1 rounded text-[10px]", mode === "raw" ? "bg-(--color-accent-soft) text-(--color-accent)" : "text-(--color-fg-dim) hover:bg-(--color-bg-mute)")}
        >
          Raw
        </button>
      </div>

      <div className="flex items-center gap-2 text-[10px] text-(--color-fg-dim)">
        <span>{displayNodes.length}/{flatNodes.length} nodes</span>
        {mode === "compact" && hiddenCount > 0 && <span>hidden intermediate: {hiddenCount}</span>}
      </div>

      <div className="border border-(--color-border) rounded bg-(--color-bg) max-h-96 overflow-auto">
        {displayNodes.length === 0 ? (
          <div className="p-3 text-(--color-fg-dim)">Нет сообщений для дерева.</div>
        ) : (
          displayNodes.map((item) => (
            <TreeRow
              key={item.node.entry.id}
              item={item}
              active={activeIds.has(item.node.entry.id)}
              current={leafId === item.node.entry.id}
              selected={selectedId === item.node.entry.id}
              onSelect={() => setSelectedId(item.node.entry.id)}
            />
          ))
        )}
      </div>

      {selected && (
        <div className="border border-(--color-border) rounded bg-(--color-bg) p-2 space-y-2">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] text-(--color-fg-dim)">{selected.node.entry.id.slice(0, 12)}</span>
            <span className="text-[10px] text-(--color-fg-dim)">{entryRole(selected.node.entry) ?? selected.node.entry.type}</span>
            {selected.node.entry.id === leafId && <span className="text-[10px] text-(--color-accent)">current</span>}
          </div>
          <div className="text-(--color-fg-mute) whitespace-pre-wrap max-h-28 overflow-y-auto">{selected.text || "—"}</div>
          <div className="flex flex-wrap gap-1.5">
            <Button variant="primary" size="sm" icon={<Navigation size={11} />} onClick={() => void navigate()} disabled={loading || restoring || selected.node.entry.id === leafId}>
              Перейти
            </Button>
            <Button variant="subtle" size="sm" icon={<RotateCcw size={11} />} onClick={() => void restore()} disabled={loading || restoring || !canRestoreSelected}>
              Restore files
            </Button>
          </div>
          {!canRestoreSelected && (
            <div className="text-[10px] text-(--color-fg-dim)">
              Restore доступен только для текущей активной ветки. Сначала перейди к выбранному узлу.
            </div>
          )}
        </div>
      )}

      <CheckpointBlock title="Checkpoint selected turn" status={turnCheckpoint} />
      <CheckpointBlock title="Checkpoint session" status={checkpoint} />

      {result && (
        <div className="border border-(--color-border) rounded bg-(--color-bg) p-2 space-y-1">
          <div className="flex items-center gap-1 text-(--color-accent)">
            <FileWarning size={12} /> Restore result
          </div>
          <div>Restored: {result.restored.length}</div>
          <div>Deleted: {result.deleted.length}</div>
          {result.errors.length > 0 && <div className="text-(--color-danger)">Errors: {result.errors.length}</div>}
        </div>
      )}
    </div>
  );
}

function TreeRow({ item, active, current, selected, onSelect }: { item: DisplayNode; active: boolean; current: boolean; selected: boolean; onSelect(): void }) {
  const entry = item.node.entry;
  const role = entryRole(entry);
  const isUser = role === "user";
  const isAssistant = role === "assistant";
  const hasBranch = item.node.children.length > 1;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={clsx(
        "w-full text-left px-2 py-1.5 hover:bg-(--color-bg-mute)",
        selected && "bg-(--color-accent-soft)/40",
        active ? "text-(--color-fg)" : "text-(--color-fg-dim)",
      )}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="font-mono text-[10px] text-(--color-fg-dim) whitespace-pre shrink-0">
          {"  ".repeat(item.displayDepth)}
          {item.displayDepth > 0 ? (item.siblingIndex === item.siblingCount - 1 ? "└─" : "├─") : ""}
        </span>
        {isUser ? (
          <MessageSquare size={11} className="text-(--color-accent) shrink-0" />
        ) : isAssistant ? (
          <Bot size={11} className={current ? "text-(--color-accent) shrink-0" : "text-(--color-success) shrink-0"} />
        ) : (
          <GitBranch size={11} className={current ? "text-(--color-accent) shrink-0" : "text-(--color-fg-dim) shrink-0"} />
        )}
        <span className="font-mono text-[10px] text-(--color-fg-dim) shrink-0">{entry.id.slice(0, 6)}</span>
        <span className="text-[10px] shrink-0">{isUser ? "user" : isAssistant ? "final" : entry.type}</span>
        {current && <span className="text-[10px] text-(--color-accent) shrink-0">current</span>}
        {hasBranch && <span className="text-[10px] text-(--color-warn) shrink-0">branch×{item.node.children.length}</span>}
        {item.node.label && <span className="text-[10px] text-(--color-success) shrink-0">{item.node.label}</span>}
        <span className="truncate min-w-0">{compactText(item.text) || entry.id}</span>
      </div>
    </button>
  );
}

function CheckpointBlock({ title, status }: { title: string; status: rpc.FileCheckpointStatus | null }) {
  return (
    <div className="border border-(--color-border) rounded bg-(--color-bg) p-2 space-y-1">
      <div className="text-(--color-accent)">{title}</div>
      {!status || (status.modified.length === 0 && status.created.length === 0) ? (
        <div className="text-(--color-fg-dim)">Нет данных.</div>
      ) : (
        <>
          {status.modified.length > 0 && (
            <div>
              <div className="text-(--color-fg-dim)">Modified ({status.modified.length})</div>
              {status.modified.slice(0, 5).map((path) => (
                <div key={path} className="font-mono text-[10px] truncate" title={path}>{shortPath(path)}</div>
              ))}
            </div>
          )}
          {status.created.length > 0 && (
            <div>
              <div className="text-(--color-fg-dim)">Created ({status.created.length})</div>
              {status.created.slice(0, 5).map((path) => (
                <div key={path} className="font-mono text-[10px] truncate" title={path}>{shortPath(path)}</div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
