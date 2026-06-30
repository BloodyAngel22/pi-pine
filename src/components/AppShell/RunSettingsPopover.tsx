import { Popover } from "@mantine/core";
import { Bot, Check, ChevronDown, ChevronUp, GitFork, Plus, Settings2, ShieldAlert, SlidersHorizontal } from "lucide-react";
import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
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
  const presetError = useAgentsStore((s) => s.error);
  const ensureDefault = useAgentsStore((s) => s.ensureDefault);
  const selectPreset = useAgentsStore((s) => s.selectPreset);
  const clearPreset = useAgentsStore((s) => s.clearPreset);
  const yoloMode = useExt((s) => s.yoloMode);
  const toggleYoloMode = useExt((s) => s.toggleYoloMode);
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const presetMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    void ensureDefault();
  }, [ensureDefault, open]);

  useEffect(() => {
    if (!open) setPresetMenuOpen(false);
  }, [open]);

  useEffect(() => {
    if (!presetMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!presetMenuRef.current?.contains(event.target as Node)) setPresetMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPresetMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [presetMenuOpen]);

  const providerLabel = model?.provider ?? "provider";
  const modelLabel = model?.id ?? "model";
  const shortModelLabel = middleTruncate(modelLabel);
  const presetLabel = activePreset || "manual";
  const fullRunLabel = model ? `${presetLabel} · ${model.provider}/${model.id} · ${thinkingLevel}` : `${presetLabel} · model not selected · ${thinkingLevel}`;
  const presetMenuValue = activePreset ?? "__manual__";
  const presetMenuItems = [
    { value: "__manual__", label: "Manual" },
    ...presets.map((preset) => ({ value: preset.name, label: preset.name })),
  ];
  const presetTriggerLabel = activePreset ?? "Manual";
  const applyPreset = async (name: string | null) => {
    setPresetMenuOpen(false);
    if (!name || name === "__manual__") {
      clearPreset();
      return;
    }
    await selectPreset(name, { sessionId: activeTabId }).catch(() => undefined);
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
      transitionProps={{ transition: "pop", duration: 140, timingFunction: "cubic-bezier(0.22,1,0.36,1)" }}
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
            <div ref={presetMenuRef} className="relative">
              <button
                type="button"
                disabled={loadingPresets}
                onClick={() => setPresetMenuOpen((v) => !v)}
                aria-haspopup="listbox"
                aria-expanded={presetMenuOpen}
                className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-(--color-border) bg-(--color-bg-soft) px-3 text-sm text-(--color-fg) outline-none transition-colors hover:bg-(--color-bg-mute) focus-visible:ring-2 focus-visible:ring-(--color-accent)/25 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="truncate">{presetTriggerLabel}</span>
                <ChevronDown size={14} className={clsx("shrink-0 text-(--color-fg-dim) transition-transform", presetMenuOpen && "rotate-180")} />
              </button>
              {presetMenuOpen && (
                <div
                  role="listbox"
                  className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-[240px] overflow-auto rounded-xl border border-(--color-border) bg-(--color-bg-soft) p-1 shadow-xl"
                >
                  {presetMenuItems.map((item) => {
                    const selected = item.value === presetMenuValue;
                    return (
                      <button
                        key={item.value}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => void applyPreset(item.value)}
                        className={clsx(
                          "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors",
                          selected
                            ? "bg-(--color-accent-soft) text-(--color-accent)"
                            : "text-(--color-fg) hover:bg-(--color-bg-mute)",
                        )}
                      >
                        <span className="truncate">{item.label}</span>
                        {selected && <Check size={13} className="shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {(() => {
              const preset = activePreset ? presets.find((p) => p.name === activePreset) : null;
              return (
                <div className="mt-1.5 space-y-1 text-[11px] text-(--color-fg-mute)">
                  {presetError ? (
                    <div className="rounded-md border border-(--color-danger)/25 bg-(--color-danger)/10 px-2 py-1.5 text-(--color-danger)">
                      {presetError}
                    </div>
                  ) : (
                    <div className="truncate">
                      {preset?.description || (activePreset ? "Preset applied to this session." : "Manual mode, no preset applied.")}
                    </div>
                  )}
                  {preset && (
                    <div className="flex flex-wrap gap-1 font-mono text-[10px]">
                      <span className="rounded bg-(--color-bg-mute) px-1.5 py-0.5">bash: {preset.permissions?.bash ?? "ask"}</span>
                      <span className="rounded bg-(--color-bg-mute) px-1.5 py-0.5">files: {preset.permissions?.files ?? "ask"}</span>
                      <span className="rounded bg-(--color-bg-mute) px-1.5 py-0.5">mcp: {preset.mcpPermissions?.mode ?? "ask"}</span>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-(--color-fg-dim)">Thinking</div>
            <div
              role="radiogroup"
              aria-label="Thinking level"
              className="grid grid-cols-4 gap-0.5 rounded-lg border border-(--color-border) bg-(--color-bg-soft) p-0.5"
            >
              {thinkingOptions.map((option) => {
                const active = option.value === thinkingLevel;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => void setThinking(option.value)}
                    className={clsx(
                      "h-7 min-w-0 rounded-md px-2 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent)/25",
                      active
                        ? "bg-(--color-accent-soft) text-(--color-accent) shadow-sm ring-1 ring-(--color-accent)/20"
                        : "text-(--color-fg-mute) hover:bg-(--color-bg-mute) hover:text-(--color-fg)",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
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
