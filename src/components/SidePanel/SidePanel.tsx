import { useRef, useState } from "react";
import { X, Layers, Database, Activity, ListTodo, GitBranch, Bot, Terminal } from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { ModelsTab } from "./ModelsTab";
import { McpTab } from "./McpTab";
import { StatusTab } from "./StatusTab";
import { PlanTab } from "./PlanTab";
import { TreeTab } from "./TreeTab";
import { SubagentsTab } from "./SubagentsTab";
import { CommandsTab } from "./CommandsTab";
import { useUiPrefs, SIDEPANEL_MIN, SIDEPANEL_MAX } from "@/store/uiPrefs";
import { useResize } from "@/lib/useResize";
import { useChat } from "@/store/chat";

type Tab = "models" | "mcp" | "status" | "plan" | "tree" | "subagents" | "commands";

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

  const tabsRef = useRef<HTMLDivElement>(null);
  const onTabsWheel = (e: React.WheelEvent) => {
    const el = tabsRef.current;
    if (!el) return;
    if (el.scrollWidth <= el.clientWidth) return;
    e.preventDefault();
    el.scrollLeft += e.deltaY || e.deltaX;
  };

  return (
    <aside
      className="shrink-0 min-w-0 overflow-hidden border-l border-(--color-border) bg-(--color-bg-soft) flex flex-col relative"
      style={{ width }}
    >
      <div
        className={clsx("pi-resizer pi-resizer-left", resize.active && "pi-resizer-active")}
        onMouseDown={resize.onMouseDown}
      />
      <div className="flex items-center min-w-0 border-b border-(--color-border)">
        <div
          ref={tabsRef}
          onWheel={onTabsWheel}
          className="pi-sidepanel-tabs flex items-center min-w-0 overflow-x-hidden overflow-y-hidden flex-1"
        >
          <TabBtn icon={<Layers size={12} />} label="Модели" active={tab === "models"} onClick={() => setTab("models")} />
          <TabBtn icon={<Database size={12} />} label="MCP" active={tab === "mcp"} onClick={() => setTab("mcp")} />
          <TabBtn icon={<ListTodo size={12} />} label="План" active={tab === "plan"} onClick={() => setTab("plan")} />
          <TabBtn icon={<GitBranch size={12} />} label="Tree" active={tab === "tree"} onClick={() => setTab("tree")} />
          <TabBtn icon={<Bot size={12} />} label="Agents" active={tab === "subagents"} onClick={() => setTab("subagents")} />
          <TabBtn icon={<Terminal size={12} />} label="Cmd" active={tab === "commands"} onClick={() => setTab("commands")} />
          <TabBtn icon={<Activity size={12} />} label="Статус" active={tab === "status"} onClick={() => setTab("status")} />
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} icon={<X size={12} />} className="shrink-0 mr-1" />
      </div>
      <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden pt-3">
        {tab === "models" && <ModelsTab />}
        {tab === "mcp" && <McpTab />}
        {tab === "plan" && <PlanTab />}
        {tab === "tree" && <TreeTab />}
        {tab === "subagents" && <SubagentsTab />}
        {tab === "commands" && <CommandsTab />}
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
        "flex shrink-0 items-center gap-1.5 px-3 py-2 text-xs border-b-2 transition-colors",
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
