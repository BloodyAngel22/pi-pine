import { PanelTop } from "lucide-react";
import { useChat } from "@/store/chat";

export function AppTitleBar() {
  const sessionName = useChat((s) => s.agentState?.sessionName || s.activeTabId || "Pi Pine");
  const model = useChat((s) => s.agentState?.model);
  const modelLabel = model ? `${model.provider}/${model.id}` : "agent idle";

  return (
    <header className="flex h-[34px] shrink-0 items-center border-b border-(--color-border-muted) bg-(--color-bg-soft) px-3">
      <div className="flex min-w-0 flex-1 items-center gap-2 text-xs">
        <PanelTop size={13} className="text-(--color-fg-dim)" />
        <span className="truncate font-semibold tracking-[-0.01em] text-(--color-fg)">{sessionName}</span>
        <span className="text-(--color-fg-dim)">·</span>
        <span className="truncate font-mono text-[11px] text-(--color-fg-mute)">{modelLabel}</span>
      </div>
      <div className="shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-(--color-fg-dim)">Pi Pine</div>
    </header>
  );
}
