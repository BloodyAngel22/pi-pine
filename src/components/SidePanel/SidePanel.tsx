import { useState } from "react";
import { X, Layers, Database, Activity, ListTodo } from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { ModelsTab } from "./ModelsTab";
import { McpTab } from "./McpTab";
import { StatusTab } from "./StatusTab";
import { PlanTab } from "./PlanTab";
import { useUiPrefs, SIDEPANEL_MIN, SIDEPANEL_MAX } from "@/store/uiPrefs";
import { useResize } from "@/lib/useResize";
import { useChat } from "@/store/chat";

type Tab = "models" | "mcp" | "status" | "plan";

export function SidePanel({ onClose }: { onClose: () => void }) {
  const planMode = useChat((s) => s.planMode);
  const [tab, setTab] = useState<Tab>(planMode ? "plan" : "models");
  const width = useUiPrefs((s) => s.sidePanelWidth);
  const setWidth = useUiPrefs((s) => s.setSidePanelWidth);
  const resize = useResize({
    edge: "left",
    initial: width,
    min: SIDEPANEL_MIN,
    max: SIDEPANEL_MAX,
    onChange: setWidth,
  });

  return (
    <aside
      className="shrink-0 border-l border-(--color-border) bg-(--color-bg-soft) flex flex-col relative"
      style={{ width }}
    >
      <div
        className={clsx("pi-resizer pi-resizer-left", resize.active && "pi-resizer-active")}
        onMouseDown={resize.onMouseDown}
      />
      <div className="flex items-center border-b border-(--color-border)">
        <TabBtn icon={<Layers size={12} />} label="Модели" active={tab === "models"} onClick={() => setTab("models")} />
        <TabBtn icon={<Database size={12} />} label="MCP" active={tab === "mcp"} onClick={() => setTab("mcp")} />
        <TabBtn icon={<ListTodo size={12} />} label="План" active={tab === "plan"} onClick={() => setTab("plan")} />
        <TabBtn icon={<Activity size={12} />} label="Статус" active={tab === "status"} onClick={() => setTab("status")} />
        <Button variant="ghost" size="sm" onClick={onClose} icon={<X size={12} />} className="ml-auto mr-1" />
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === "models" && <ModelsTab />}
        {tab === "mcp" && <McpTab />}
        {tab === "plan" && <PlanTab />}
        {tab === "status" && <StatusTab />}
      </div>
    </aside>
  );
}

function TabBtn({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick(): void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 transition-colors",
        active
          ? "border-(--color-accent) text-(--color-fg)"
          : "border-transparent text-(--color-fg-mute) hover:text-(--color-fg) hover:bg-(--color-bg-mute)",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
