import * as Tabs from "@radix-ui/react-tabs";
import { Bot, FolderCog, Image, KeyRound, Palette } from "@/components/ui/icons/compat";
import clsx from "clsx";

export type SettingsSectionId = "environment" | "model" | "interface" | "images" | "auth";

const items: Array<{ id: SettingsSectionId; label: string; icon: React.ReactNode }> = [
  { id: "environment", label: "Environment", icon: <FolderCog size={14} /> },
  { id: "model", label: "Model", icon: <Bot size={14} /> },
  { id: "interface", label: "Interface", icon: <Palette size={14} /> },
  { id: "images", label: "Images", icon: <Image size={14} /> },
  { id: "auth", label: "MCP/Auth", icon: <KeyRound size={14} /> },
];

export function SettingsNav({ active }: { active: SettingsSectionId }) {
  return (
    <Tabs.List aria-label="Settings sections" className="w-44 shrink-0 border-r border-(--color-border-muted) bg-(--color-bg)/55 p-2">
      <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-(--color-fg-dim)">Settings</div>
      <div className="space-y-1">
        {items.map((item) => {
          const selected = item.id === active;
          return (
            <Tabs.Trigger
              key={item.id}
              value={item.id}
              className={clsx(
                "flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent)/25",
                selected
                  ? "bg-(--color-accent-soft) text-(--color-accent)"
                  : "text-(--color-fg-mute) hover:bg-(--color-bg-mute) hover:text-(--color-fg)",
              )}
            >
              {item.icon}
              {item.label}
            </Tabs.Trigger>
          );
        })}
      </div>
    </Tabs.List>
  );
}
