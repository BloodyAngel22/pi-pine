import { Popover, SegmentedControl as MantineSegmentedControl, Select as MantineSelect } from "@mantine/core";
import { Bot, ChevronUp, GitFork, Plus, Settings2, ShieldAlert, SlidersHorizontal } from "lucide-react";
import clsx from "clsx";
import { useEffect } from "react";
import { useChat } from "@/store/chat";
import { useExt } from "@/store/ext";
import { useAgentsStore } from "@/store/agents";
import type { ThinkingLevel } from "@/rpc/types";
import { Switch } from "@/components/ui/Switch";
import { Button } from "@/components/ui/Button";

interface RunSettingsPopoverProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  onOpenSettings?(): void;
  triggerClassName?: string;
}

const thinkingOptions: Array<{ value: ThinkingLevel; label: string }> = [
  { value: "off", label: "Off" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Med" },
  { value: "high", label: "High" },
];

function middleTruncate(value: string, head = 16, tail = 14): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function RunSettingsPopover({ open, onOpenChange, onOpenSettings, triggerClassName }: RunSettingsPopoverProps) {
  const model = useChat((s) => s.agentState?.model);
  const activeTabId = useChat((s) => s.activeTabId);
  const refreshState = useChat((s) => s.refreshState);
  const thinkingLevel = useChat((s) => s.agentState?.thinkingLevel ?? "off");
  const setThinking = useChat((s) => s.setThinking);
  const planMode = useChat((s) => s.planMode);
  const togglePlanMode = useChat((s) => s.togglePlanMode);
  const createSessionTab = useChat((s) => s.createSessionTab);
  const createForkTab = useChat((s) => s.createForkTab);
  const presets = useAgentsStore((s) => s.presets);
  const activePreset = useAgentsStore((s) => s.activePreset);
  const loadingPresets = useAgentsStore((s) => s.loading);
  const ensureDefault = useAgentsStore((s) => s.ensureDefault);
  const selectPreset = useAgentsStore((s) => s.selectPreset);
  const clearPreset = useAgentsStore((s) => s.clearPreset);
  const yoloMode = useExt((s) => s.yoloMode);
  const toggleYoloMode = useExt((s) => s.toggleYoloMode);

  useEffect(() => {
    if (!open) return;
    void ensureDefault();
  }, [ensureDefault, open]);

  const providerLabel = model?.provider ?? "provider";
  const modelLabel = model?.id ?? "model";
  const shortModelLabel = middleTruncate(modelLabel);
  const presetLabel = activePreset || "manual";
  const fullRunLabel = model ? `${presetLabel} · ${model.provider}/${model.id} · ${thinkingLevel}` : `${presetLabel} · model not selected · ${thinkingLevel}`;
  const applyPreset = async (name: string | null) => {
    if (!name || name === "__manual__") {
      clearPreset();
      return;
    }
    await selectPreset(name, { sessionId: activeTabId });
    await refreshState().catch(() => undefined);
  };

  return (
    <Popover
      opened={open}
      onChange={onOpenChange}
      position="top-end"
      offset={8}
      width={360}
      shadow="xl"
      radius="md"
      withinPortal
      trapFocus={false}
      classNames={{ dropdown: "pi-run-settings-dropdown" }}
    >
      <Popover.Target>
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          className={clsx(
            "inline-flex h-7 max-w-[440px] items-center gap-1.5 rounded-lg border px-2 text-[11px] font-medium transition-colors",
            open
              ? "border-(--color-accent)/35 bg-(--color-accent-soft) text-(--color-accent)"
              : "border-(--color-border) bg-(--color-bg-soft) text-(--color-fg-mute) hover:bg-(--color-bg-mute) hover:text-(--color-fg)",
            triggerClassName,
          )}
          aria-label="Run settings"
          title={fullRunLabel}
        >
          <SlidersHorizontal size={12} className="shrink-0" />
          <span className="max-w-[92px] truncate text-(--color-accent)">{presetLabel}</span>
          <span className="text-(--color-fg-dim)">·</span>
          <span className="max-w-[88px] truncate font-mono text-(--color-fg-mute)">{providerLabel}</span>
          <span className="font-mono text-(--color-fg-dim)">/</span>
          <span className="max-w-[178px] truncate font-mono text-(--color-fg)">{shortModelLabel}</span>
          <span className="text-(--color-fg-dim)">·</span>
          <span className="shrink-0">{thinkingLevel}</span>
          <ChevronUp size={12} className={clsx("shrink-0 transition-transform", open && "rotate-180")} />
        </button>
      </Popover.Target>
      <Popover.Dropdown>
        <div className="border-b border-(--color-border-muted) px-3 py-2.5">
          <div className="text-xs font-semibold text-(--color-fg)">Run settings</div>
          <div className="mt-0.5 truncate font-mono text-[11px] text-(--color-fg-mute)">{model ? `${model.provider}/${model.id}` : "model not selected"}</div>
        </div>
        <div className="space-y-3 p-3">
          <div className="rounded-xl border border-(--color-border-muted) bg-(--color-bg)/55 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-(--color-fg)">
              <Bot size={13} className="text-(--color-accent)" />
              Agent preset
            </div>
            <MantineSelect
              value={activePreset ?? "__manual__"}
              onChange={(value) => void applyPreset(value)}
              data={[{ value: "__manual__", label: "Manual" }, ...presets.map((preset) => ({ value: preset.name, label: preset.name }))]}
              searchable
              disabled={loadingPresets}
              allowDeselect={false}
              classNames={{ input: "pi-mantine-input", dropdown: "pi-mantine-select-dropdown", option: "pi-mantine-select-option" }}
            />
            <div className="mt-1.5 truncate text-[11px] text-(--color-fg-mute)">
              {activePreset ? presets.find((preset) => preset.name === activePreset)?.description || "Preset applied to this session." : "Manual mode, no preset applied."}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-(--color-fg-dim)">Thinking</div>
            <MantineSegmentedControl
              value={thinkingLevel}
              onChange={(value) => void setThinking(value as ThinkingLevel)}
              data={thinkingOptions}
              fullWidth
              size="xs"
              classNames={{ root: "pi-thinking-control", control: "pi-thinking-control-item", label: "pi-thinking-control-label", indicator: "pi-thinking-control-indicator" }}
            />
          </div>

          <div className="space-y-2 rounded-xl border border-(--color-border-muted) bg-(--color-bg-soft) p-3">
            <Switch checked={planMode} onChange={() => void togglePlanMode()} label="Plan mode" description="Генерировать и исполнять планы явно." />
            <Switch checked={yoloMode} onChange={() => toggleYoloMode()} label="YOLO permissions" description="Авто-апрув разрешений. Опасно." />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="subtle" size="sm" icon={<Plus size={13} />} onClick={() => void createSessionTab().then(() => onOpenChange(false))}>New</Button>
            <Button variant="subtle" size="sm" icon={<GitFork size={13} />} onClick={() => void createForkTab().then(() => onOpenChange(false))}>Fork</Button>
          </div>
          {onOpenSettings && (
            <Button variant="ghost" size="sm" icon={<Settings2 size={13} />} onClick={onOpenSettings} className="w-full justify-start">Open settings</Button>
          )}
          {yoloMode && (
            <div className="flex items-start gap-2 rounded-lg border border-(--color-danger)/20 bg-(--color-danger)/10 px-2.5 py-2 text-[11px] text-(--color-danger)">
              <ShieldAlert size={13} className="mt-0.5 shrink-0" />
              YOLO can modify files or run commands without asking.
            </div>
          )}
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}
