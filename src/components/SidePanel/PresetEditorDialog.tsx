import { useEffect, useMemo, useRef, useState, useCallback, type ReactNode } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useChat } from "@/store/chat";
import { useModels } from "@/store/models";
import type { AgentPresetConfig, AgentPresetMcpMode, AgentPresetPermissionMode, QueueMode, ThinkingLevel } from "@/rpc/types";

const thinkingLevels: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];
const queueModes: QueueMode[] = ["all", "one-at-a-time"];
const permissionModes: AgentPresetPermissionMode[] = ["allow", "read-only", "deny"];
const mcpModes: AgentPresetMcpMode[] = ["allow-all", "deny-all"];

function createEmptyPreset(cwd: string): AgentPresetConfig {
  return {
    name: "",
    description: "",
    model: null,
    thinkingLevel: "medium",
    systemPrompt: "",
    permissions: { bash: "allow", files: "allow" },
    mcpPermissions: { mode: "allow-all" },
    autoRetry: true,
    autoCompaction: true,
    steeringMode: "all",
    followUpMode: "all",
    projectCwd: null,
  };
}

export function PresetEditorDialog({
  open,
  preset,
  existingNames,
  onClose,
  onSave,
}: {
  open: boolean;
  preset?: AgentPresetConfig | null;
  existingNames: string[];
  onClose(): void;
  onSave(preset: AgentPresetConfig): Promise<void> | void;
}) {
  const cwd = useChat((s) => s.cwd);
  const available = useModels((s) => s.available);
  const loadAvailable = useModels((s) => s.loadAvailable);
  const [draft, setDraft] = useState<AgentPresetConfig>(() => preset ?? createEmptyPreset(cwd));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(preset ? structuredClone(preset) : createEmptyPreset(cwd));
    setError(null);
    void loadAvailable();
  }, [cwd, loadAvailable, open, preset]);

  const duplicate = useMemo(() => {
    const name = draft.name.trim();
    if (!name) return false;
    if (preset?.name === name) return false;
    return existingNames.includes(name);
  }, [draft.name, existingNames, preset?.name]);

  if (!open) return null;

  const setField = <K extends keyof AgentPresetConfig>(key: K, value: AgentPresetConfig[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const save = async () => {
    const name = draft.name.trim();
    if (!name) {
      setError("Укажи имя пресета");
      return;
    }
    if (duplicate) {
      setError("Пресет с таким именем уже есть");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ ...draft, name, projectCwd: draft.projectCwd?.trim() || null });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-xl border border-(--color-border) bg-(--color-bg-soft) shadow-xl flex flex-col">
        <div className="flex items-center justify-between border-b border-(--color-border) px-4 py-3">
          <div>
            <div className="text-sm font-semibold">{preset ? "Редактировать пресет" : "Новый пресет"}</div>
            <div className="text-xs text-(--color-fg-mute)">Модель, инструкции и permissions для агента</div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} icon={<X size={14} />} />
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <Field label="Name" hint="Имя файла в ~/.pi/agent/agents/*.json">
            <Input value={draft.name} onChange={(e) => setField("name", e.target.value)} disabled={Boolean(preset)} />
          </Field>
          <Field label="Description">
            <textarea
              value={draft.description ?? ""}
              onChange={(e) => setField("description", e.target.value)}
              className="w-full min-h-16 bg-(--color-bg) border border-(--color-border) rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-(--color-accent)/50"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Model">
              <ModelSearchSelect
                available={available}
                value={draft.model?.provider && (draft.model.modelId || draft.model.id) ? `${draft.model.provider}/${draft.model.modelId ?? draft.model.id}` : null}
                onChange={(val) => {
                  if (!val) {
                    setField("model", null);
                  } else {
                    const [provider, ...rest] = val.split("/");
                    const modelId = rest.join("/");
                    setField("model", { provider, modelId });
                  }
                }}
              />
            </Field>
            <Field label="Thinking level">
              <SelectDropdown
                options={thinkingLevels}
                value={draft.thinkingLevel ?? "medium"}
                onChange={(val) => setField("thinkingLevel", val as ThinkingLevel)}
              />
            </Field>
          </div>

          <Field label="System prompt" hint="Будет добавлен к базовому system prompt через set_custom_instructions">
            <textarea
              value={draft.systemPrompt ?? ""}
              onChange={(e) => setField("systemPrompt", e.target.value)}
              className="w-full min-h-40 font-mono bg-(--color-bg) border border-(--color-border) rounded-md px-2.5 py-1.5 text-xs outline-none focus:border-(--color-accent)/50"
            />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <SelectField label="Bash" value={draft.permissions?.bash ?? "allow"} options={permissionModes} onChange={(value) => setField("permissions", { ...(draft.permissions ?? {}), bash: value as AgentPresetPermissionMode })} />
            <SelectField label="Files" value={draft.permissions?.files ?? "allow"} options={permissionModes} onChange={(value) => setField("permissions", { ...(draft.permissions ?? {}), files: value as AgentPresetPermissionMode })} />
            <SelectField label="MCP" value={draft.mcpPermissions?.mode ?? "allow-all"} options={mcpModes} onChange={(value) => setField("mcpPermissions", { mode: value as AgentPresetMcpMode })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Steering mode" value={draft.steeringMode ?? "all"} options={queueModes} onChange={(value) => setField("steeringMode", value as QueueMode)} />
            <SelectField label="Follow-up mode" value={draft.followUpMode ?? "all"} options={queueModes} onChange={(value) => setField("followUpMode", value as QueueMode)} />
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <label className="flex items-center gap-2 text-(--color-fg-mute)">
              <input type="checkbox" checked={draft.autoRetry ?? true} onChange={(e) => setField("autoRetry", e.target.checked)} />
              Auto retry
            </label>
            <label className="flex items-center gap-2 text-(--color-fg-mute)">
              <input type="checkbox" checked={draft.autoCompaction ?? true} onChange={(e) => setField("autoCompaction", e.target.checked)} />
              Auto compaction
            </label>
          </div>

          <Field label="Project path" hint="Если указан, пресет автоматически применится для этого cwd">
            <div className="flex gap-2">
              <Input value={draft.projectCwd ?? ""} onChange={(e) => setField("projectCwd", e.target.value || null)} placeholder="/home/user/project" />
              <Button variant="subtle" size="sm" onClick={() => setField("projectCwd", cwd)}>Use current CWD</Button>
            </div>
          </Field>

          {(error || duplicate) && <div className="text-xs text-(--color-danger)">{error || "Пресет с таким именем уже есть"}</div>}
        </div>

        <div className="flex justify-end gap-2 border-t border-(--color-border) p-3">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={saving || !draft.name.trim() || duplicate}>Save</Button>
        </div>
      </div>
    </div>
  );
}

function ModelSearchSelect({
  available,
  value,
  onChange,
}: {
  available: Array<{ provider: string; id: string }>;
  value: string | null;
  onChange(val: string | null): void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const wrapper = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapper.current && !wrapper.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const q = query.toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return available;
    return available.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q) ||
        `${m.provider}/${m.id}`.toLowerCase().includes(q),
    );
  }, [available, q]);

  // Reset focused index when filtered list changes
  useEffect(() => setFocusedIdx(-1), [filtered.length]);

  const currentLabel = value ?? "";

  const select = (val: string | null) => {
    onChange(val);
    setQuery("");
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIdx((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (focusedIdx >= 0 && focusedIdx < filtered.length) {
        const m = filtered[focusedIdx];
        select(`${m.provider}/${m.id}`);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIdx < 0) return;
    const el = wrapper.current?.querySelector(`[data-idx="${focusedIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [focusedIdx]);

  return (
    <div ref={wrapper} className="relative">
      <div
        className={`flex items-center gap-1 w-full bg-(--color-bg) border border-(--color-border) rounded-md px-2 py-1.5 text-sm text-(--color-fg) cursor-pointer hover:border-(--color-accent)/40 ${open ? "border-(--color-accent)/50" : ""}`}
        onClick={() => {
          if (!open) {
            setOpen(true);
            setTimeout(() => inputRef.current?.focus(), 0);
          }
        }}
      >
        <Search size={12} className="shrink-0 text-(--color-fg-dim)" />
        {open ? (
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Поиск модели…"
            className="flex-1 bg-transparent outline-none text-sm text-(--color-fg) placeholder:text-(--color-fg-dim)"
          />
        ) : (
          <span className={`flex-1 truncate ${currentLabel ? "" : "text-(--color-fg-dim)"}`}>
            {currentLabel || "Не менять модель"}
          </span>
        )}
        {!open && <ChevronDown size={12} className="shrink-0 text-(--color-fg-dim)" />}
      </div>

      {open && (
        <div className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto border border-(--color-border) rounded-md bg-(--color-bg-soft) shadow-lg">
          <button
            type="button"
            data-idx="-1"
            className={`w-full text-left px-2 py-1.5 text-sm hover:bg-(--color-bg-mute) ${value === null ? "bg-(--color-accent-soft)/30" : "text-(--color-fg-dim)"}`}
            onClick={() => select(null)}
          >
            Не менять модель
          </button>
          {filtered.slice(0, 200).map((m, idx) => {
            const key = `${m.provider}/${m.id}`;
            const isSelected = key === currentLabel;
            const isFocused = focusedIdx === idx;
            return (
              <button
                key={key}
                type="button"
                data-idx={idx}
                className={`w-full text-left flex items-center gap-1.5 px-2 py-1.5 text-xs rounded-none cursor-pointer
                  ${isSelected ? "bg-(--color-accent-soft)/30" : ""}
                  ${isFocused ? "bg-(--color-bg-mute)" : ""}
                  hover:bg-(--color-bg-mute)`}
                onClick={() => select(key)}
              >
                <span className="font-mono text-(--color-fg-mute) w-24 truncate shrink-0">{m.provider}</span>
                <span className="font-mono text-(--color-fg) truncate">{m.id}</span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="px-2 py-4 text-xs text-(--color-fg-dim) text-center">Нет моделей по запросу</div>
          )}
          {filtered.length > 200 && (
            <div className="px-2 py-1 text-[11px] text-(--color-fg-dim) text-center border-t border-(--color-border)">
              … и ещё {filtered.length - 200}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SelectDropdown({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange(val: string): void;
}) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapper.current && !wrapper.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const select = useCallback(
    (val: string) => {
      onChange(val);
      setOpen(false);
    },
    [onChange],
  );

  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 w-full bg-(--color-bg) border border-(--color-border) rounded-md px-2 py-1.5 text-sm text-(--color-fg) cursor-pointer hover:border-(--color-accent)/40"
      >
        <span className="flex-1 truncate text-left">{value}</span>
        <ChevronDown size={12} className="shrink-0 text-(--color-fg-dim)" />
      </button>

      {open && (
        <div className="absolute z-10 mt-1 w-full border border-(--color-border) rounded-md bg-(--color-bg-soft) shadow-lg overflow-hidden">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              className={`w-full text-left px-2 py-1.5 text-sm cursor-pointer hover:bg-(--color-bg-mute) ${
                option === value ? "bg-(--color-accent-soft)/30" : ""
              }`}
              onClick={() => select(option)}
            >
              {option}
            </button>
          ))}
        </div>
      )}
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

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange(value: string): void }) {
  return (
    <Field label={label}>
      <SelectDropdown options={options} value={value} onChange={onChange} />
    </Field>
  );
}
