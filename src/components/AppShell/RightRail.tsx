import { Activity, Bot, Command, Database, GitBranch, Layers, ListTodo, Monitor, Terminal } from "lucide-react";
import { IconRail, RailButton } from "./IconRail";
import type { SidePanelTab } from "@/components/SidePanel/SidePanel";

interface RightRailProps {
  activeTab: SidePanelTab | null;
  panelOpen: boolean;
  mainTab: "chat" | "terminal";
  onSelectPanel(tab: SidePanelTab): void;
  onToggleTerminal(): void;
}

export function RightRail({ activeTab, panelOpen, mainTab, onSelectPanel, onToggleTerminal }: RightRailProps) {
  const isActive = (tab: SidePanelTab) => panelOpen && activeTab === tab;
  return (
    <IconRail side="right">
      <RailButton side="right" icon={<Layers size={17} />} label="Модели" active={isActive("models")} onClick={() => onSelectPanel("models")} />
      <RailButton side="right" icon={<Bot size={17} />} label="Пресеты" active={isActive("presets")} onClick={() => onSelectPanel("presets")} />
      <RailButton side="right" icon={<Database size={17} />} label="MCP" active={isActive("mcp")} onClick={() => onSelectPanel("mcp")} />
      <RailButton side="right" icon={<ListTodo size={17} />} label="План" active={isActive("plan")} onClick={() => onSelectPanel("plan")} />
      <RailButton side="right" icon={<GitBranch size={17} />} label="Дерево сессии" active={isActive("tree")} onClick={() => onSelectPanel("tree")} />
      <RailButton side="right" icon={<Command size={17} />} label="Команды" active={isActive("commands")} onClick={() => onSelectPanel("commands")} />
      <RailButton side="right" icon={<Terminal size={17} />} label="Терминал" active={mainTab === "terminal"} onClick={onToggleTerminal} />
      <div className="flex-1" />
      <RailButton side="right" icon={<Activity size={17} />} label="Статус" active={isActive("status")} onClick={() => onSelectPanel("status")} />
      <RailButton side="right" icon={<Monitor size={17} />} label="Субагенты" active={isActive("subagents")} onClick={() => onSelectPanel("subagents")} />
    </IconRail>
  );
}
