import { useEffect, useState } from "react";
import { Bot, CheckCircle2, Pencil, Plus, RefreshCcw, Trash2, Wand2 } from "@/components/ui/icons/compat";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { useAgentsStore } from "@/store/agents";
import { useChat } from "@/store/chat";
import type { AgentPresetConfig } from "@/rpc/types";
import { PresetEditorDialog } from "./PresetEditorDialog";

export function PresetsTab() {
  const presets = useAgentsStore((s) => s.presets);
  const activePreset = useAgentsStore((s) => s.activePreset);
  const loading = useAgentsStore((s) => s.loading);
  const error = useAgentsStore((s) => s.error);
  const loadPresets = useAgentsStore((s) => s.loadPresets);
  const ensureDefault = useAgentsStore((s) => s.ensureDefault);
  const selectPreset = useAgentsStore((s) => s.selectPreset);
  const createPreset = useAgentsStore((s) => s.createPreset);
  const updatePreset = useAgentsStore((s) => s.updatePreset);
  const deletePreset = useAgentsStore((s) => s.deletePreset);
  const clearPreset = useAgentsStore((s) => s.clearPreset);
  const cwd = useChat((s) => s.cwd);
  const activeTabId = useChat((s) => s.activeTabId);
  const refreshState = useChat((s) => s.refreshState);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<AgentPresetConfig | null>(null);

  useEffect(() => {
    void ensureDefault();
  }, [ensureDefault]);

  const apply = async (name: string) => {
    await selectPreset(name, { sessionId: activeTabId });
    await refreshState().catch(() => undefined);
  };

  const save = async (preset: AgentPresetConfig) => {
    if (editingPreset) {
      await updatePreset(preset, activeTabId);
    } else {
      await createPreset(preset);
    }
    await refreshState().catch(() => undefined);
  };

  const onDelete = async (name: string) => {
    if (!window.confirm("Удалить пресет?")) return;
    await deletePreset(name);
  };

  return (
    <div className="p-3 space-y-3 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold flex items-center gap-1.5">
            <Bot size={14} /> Пресеты агентов
          </div>
          <div className="text-xs text-(--color-fg-dim)">~/.pi/agent/agents/*.json</div>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => void loadPresets()} icon={<RefreshCcw size={12} />} title="Обновить" />
          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={12} />}
            onClick={() => {
              setEditingPreset(null);
              setEditorOpen(true);
            }}
          >
            New
          </Button>
        </div>
      </div>

      {error && <div className="text-xs text-(--color-danger) bg-(--color-danger)/10 rounded p-2">{error}</div>}

      {loading && presets.length === 0 && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-20 rounded-lg bg-(--color-bg-mute) animate-pulse" />)}
        </div>
      )}

      {!loading && presets.length === 0 && (
        <div className="text-xs text-(--color-fg-dim) border border-dashed border-(--color-border) rounded-lg p-4 text-center">
          Нет пресетов. Создай первый пресет агента.
        </div>
      )}

      <div className="space-y-2">
        {presets.map((preset) => {
          const isActive = activePreset === preset.name;
          const isAuto = Boolean(preset.projectCwd && preset.projectCwd === cwd);
          const model = preset.model?.provider && (preset.model.modelId || preset.model.id)
            ? `${preset.model.provider}/${preset.model.modelId ?? preset.model.id}`
            : "model: unchanged";
          return (
            <div
              key={preset.name}
              className={clsx(
                "rounded-lg border p-3 space-y-2 bg-(--color-bg)",
                isActive ? "border-(--color-accent)/60" : "border-(--color-border)",
              )}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-semibold text-sm truncate">{preset.name}</span>
                    {isActive && <Chip size="xs" tone="accent">Active</Chip>}
                    {isAuto && <Chip size="xs" tone="warning">Auto</Chip>}
                  </div>
                  {preset.description && <div className="text-xs text-(--color-fg-mute) truncate mt-0.5">{preset.description}</div>}
                </div>
                {isActive && <CheckCircle2 size={14} className="text-(--color-accent) shrink-0" />}
              </div>

              <div className="text-[11px] font-mono text-(--color-fg-dim) truncate" title={model}>{model}</div>
              <div className="flex flex-wrap gap-1 text-[11px]">
                <Chip size="xs" mono>bash: {preset.permissions?.bash ?? "ask"}</Chip>
                <Chip size="xs" mono>files: {preset.permissions?.files ?? "ask"}</Chip>
                <Chip size="xs" mono>mcp: {preset.mcpPermissions?.mode ?? "ask"}</Chip>
                {preset.thinkingLevel && <Chip size="xs" mono>think: {preset.thinkingLevel}</Chip>}
              </div>

              <div className="flex items-center justify-end gap-1">
                <Button variant="subtle" size="sm" icon={<Wand2 size={12} />} onClick={() => void apply(preset.name)} disabled={loading}>
                  Apply
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Pencil size={12} />}
                  onClick={() => {
                    setEditingPreset(preset);
                    setEditorOpen(true);
                  }}
                />
                <Button variant="danger" size="sm" icon={<Trash2 size={12} />} onClick={() => void onDelete(preset.name)} />
              </div>
            </div>
          );
        })}
      </div>

      {activePreset && (
        <Button variant="ghost" size="sm" onClick={() => clearPreset()}>
          Clear Preset (ручной режим)
        </Button>
      )}

      <PresetEditorDialog
        open={editorOpen}
        preset={editingPreset}
        existingNames={presets.map((p) => p.name)}
        onClose={() => setEditorOpen(false)}
        onSave={save}
      />
    </div>
  );
}
