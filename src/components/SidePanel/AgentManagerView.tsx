import { useEffect, useState, type ReactNode } from "react";
import clsx from "clsx";
import { Bot, Pencil, Plus, RefreshCcw, Trash2, X } from "@/components/ui/icons/compat";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { useChat } from "@/store/chat";
import { useCustomAgentsStore } from "@/store/customAgents";
import type { CustomAgentConfig } from "@/rpc/types";
import type { SaveAgentPayload } from "@/rpc/bridge";

const BUILTIN_TOOLS = ["read", "bash", "edit", "write", "grep", "find", "ls", "fast_context", "web_search"];

function createEmptyAgent(): SaveAgentPayload {
  return { name: "", description: "", systemPrompt: "", tools: [], mcpTools: [], model: "", source: "project" };
}

export function AgentManagerView() {
  const activeTabId = useChat((s) => s.activeTabId);
  const agents = useCustomAgentsStore((s) => s.agents);
  const loading = useCustomAgentsStore((s) => s.loading);
  const error = useCustomAgentsStore((s) => s.error);
  const listAgents = useCustomAgentsStore((s) => s.listAgents);
  const saveAgent = useCustomAgentsStore((s) => s.saveAgent);
  const deleteAgent = useCustomAgentsStore((s) => s.deleteAgent);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<CustomAgentConfig | null>(null);

  useEffect(() => {
    void listAgents(activeTabId);
    // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally load once per session id
  }, [activeTabId]);

  const save = async (payload: SaveAgentPayload) => {
    await saveAgent(payload, activeTabId);
  };

  const onDelete = async (agent: CustomAgentConfig) => {
    if (!window.confirm(`Удалить агента «${agent.name}»?`)) return;
    await deleteAgent(agent.name, agent.source, activeTabId);
  };

  return (
    <div className="space-y-3 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold flex items-center gap-1.5">
            <Bot size={14} /> Кастомные агенты
          </div>
          <div className="text-xs text-(--color-fg-dim)">.pi/agents/*.md и ~/.pi/agent/agents/*.md</div>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => void listAgents(activeTabId)} icon={<RefreshCcw size={12} />} title="Обновить" />
          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={12} />}
            onClick={() => {
              setEditing(null);
              setEditorOpen(true);
            }}
          >
            New
          </Button>
        </div>
      </div>

      {error && <div className="text-xs text-(--color-danger) bg-(--color-danger)/10 rounded p-2">{error}</div>}

      {loading && agents.length === 0 && (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-16 rounded-lg bg-(--color-bg-mute) animate-pulse" />
          ))}
        </div>
      )}

      {!loading && agents.length === 0 && (
        <div className="text-xs text-(--color-fg-dim) border border-dashed border-(--color-border) rounded-lg p-4 text-center">
          Нет кастомных агентов. Создай первого — он появится в параметре task(agent: "...").
        </div>
      )}

      <div className="space-y-2">
        {agents.map((agent) => (
          <div key={`${agent.source}-${agent.name}`} className="rounded-lg border border-(--color-border) bg-(--color-bg) p-3 space-y-2">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-semibold text-sm truncate">{agent.name}</span>
                  <Chip size="xs" tone={agent.source === "project" ? "accent" : "neutral"}>{agent.source}</Chip>
                </div>
                {agent.description && <div className="text-xs text-(--color-fg-mute) truncate mt-0.5">{agent.description}</div>}
              </div>
            </div>
            <div className="flex flex-wrap gap-1 text-[11px]">
              {agent.model && <Chip size="xs" mono>model: {agent.model}</Chip>}
              <Chip size="xs" mono>{agent.tools?.length ?? BUILTIN_TOOLS.length} tools</Chip>
              {agent.mcpTools?.length ? <Chip size="xs" mono>{agent.mcpTools.length} mcp</Chip> : null}
            </div>
            <div className="flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="sm"
                icon={<Pencil size={12} />}
                onClick={() => {
                  setEditing(agent);
                  setEditorOpen(true);
                }}
              />
              <Button variant="danger" size="sm" icon={<Trash2 size={12} />} onClick={() => void onDelete(agent)} />
            </div>
          </div>
        ))}
      </div>

      <AgentEditorDialog
        open={editorOpen}
        agent={editing}
        existingNames={agents.map((a) => a.name)}
        onClose={() => setEditorOpen(false)}
        onSave={save}
      />
    </div>
  );
}

function AgentEditorDialog({
  open,
  agent,
  existingNames,
  onClose,
  onSave,
}: {
  open: boolean;
  agent?: CustomAgentConfig | null;
  existingNames: string[];
  onClose(): void;
  onSave(payload: SaveAgentPayload): Promise<void> | void;
}) {
  const [draft, setDraft] = useState<SaveAgentPayload>(() => createEmptyAgent());
  const [mcpToolsText, setMcpToolsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (agent) {
      setDraft({
        name: agent.name,
        description: agent.description,
        systemPrompt: agent.systemPrompt,
        tools: agent.tools ?? [],
        mcpTools: agent.mcpTools ?? [],
        model: agent.model ?? "",
        source: agent.source,
        originalName: agent.name,
      });
      setMcpToolsText((agent.mcpTools ?? []).join(", "));
    } else {
      setDraft(createEmptyAgent());
      setMcpToolsText("");
    }
    setError(null);
  }, [agent, open]);

  if (!open) return null;

  const setField = <K extends keyof SaveAgentPayload>(key: K, value: SaveAgentPayload[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const toggleTool = (tool: string) => {
    setDraft((d) => {
      const tools = d.tools ?? [];
      return { ...d, tools: tools.includes(tool) ? tools.filter((t) => t !== tool) : [...tools, tool] };
    });
  };

  const duplicate = (() => {
    const name = draft.name.trim();
    if (!name) return false;
    if (agent?.name === name) return false;
    return existingNames.includes(name);
  })();

  const save = async () => {
    const name = draft.name.trim();
    if (!name) {
      setError("Укажи имя агента");
      return;
    }
    if (!draft.systemPrompt.trim()) {
      setError("Укажи системный промпт (тело файла)");
      return;
    }
    if (duplicate) {
      setError("Агент с таким именем уже есть");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const mcpTools = mcpToolsText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      await onSave({ ...draft, name, mcpTools: mcpTools.length > 0 ? mcpTools : undefined, tools: draft.tools?.length ? draft.tools : undefined });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-xl border border-(--color-border) bg-(--color-bg-soft) shadow-xl flex flex-col">
        <div className="flex items-center justify-between border-b border-(--color-border) px-4 py-3">
          <div>
            <div className="text-sm font-semibold">{agent ? "Редактировать агента" : "Новый агент"}</div>
            <div className="text-xs text-(--color-fg-mute)">Кастомный sub-agent для task(agent: "...")</div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} icon={<X size={14} />} />
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
          <Field label="Name">
            <Input value={draft.name} onChange={(e) => setField("name", e.target.value)} />
          </Field>
          <Field label="Description" hint="Показывается модели в списке доступных агентов">
            <Input value={draft.description} onChange={(e) => setField("description", e.target.value)} />
          </Field>
          <Field label="System prompt" hint="Тело .md файла — инструкции для агента">
            <textarea
              value={draft.systemPrompt}
              onChange={(e) => setField("systemPrompt", e.target.value)}
              className="w-full min-h-40 font-mono bg-(--color-bg) border border-(--color-border) rounded-md px-2.5 py-1.5 text-xs outline-none focus:border-(--color-accent)/50"
            />
          </Field>
          <Field label="Tools" hint="Пусто — все встроенные тулы по умолчанию">
            <div className="flex flex-wrap gap-1.5">
              {BUILTIN_TOOLS.map((tool) => (
                <button
                  key={tool}
                  type="button"
                  onClick={() => toggleTool(tool)}
                  className={clsx(
                    "font-mono text-[11px] rounded px-2 py-1 border",
                    draft.tools?.includes(tool)
                      ? "border-(--color-accent)/50 bg-(--color-accent)/10 text-(--color-accent)"
                      : "border-(--color-border) bg-(--color-bg) text-(--color-fg-dim) hover:text-(--color-fg)",
                  )}
                >
                  {tool}
                </button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="MCP tools" hint="glob-паттерны через запятую">
              <Input value={mcpToolsText} onChange={(e) => setMcpToolsText(e.target.value)} placeholder="context7_*, searxng_*" />
            </Field>
            <Field label="Model" hint="Пусто — модель родителя">
              <Input value={draft.model ?? ""} onChange={(e) => setField("model", e.target.value)} placeholder="sonnet" />
            </Field>
          </div>
          <Field label="Source">
            <div className="flex gap-3 text-xs">
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={draft.source === "project"} onChange={() => setField("source", "project")} />
                project (.pi/agents/)
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={draft.source === "user"} onChange={() => setField("source", "user")} />
                user (~/.pi/agent/agents/)
              </label>
            </div>
          </Field>

          {(error || duplicate) && <div className="text-xs text-(--color-danger)">{error || "Агент с таким именем уже есть"}</div>}
        </div>

        <div className="flex justify-end gap-2 border-t border-(--color-border) p-3">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={saving || !draft.name.trim() || duplicate}>Save</Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-(--color-fg)">{label}</span>
        {hint && <span className="text-[11px] text-(--color-fg-dim)">{hint}</span>}
      </div>
      {children}
    </label>
  );
}
