import { AppIcon } from "@/components/ui/AppIcon";
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
      <RailButton side="right" icon={<AppIcon name="model" size={17} />} label="Модели" active={isActive("models")} onClick={() => onSelectPanel("models")} />
      <RailButton side="right" icon={<AppIcon name="bot" size={17} />} label="Пресеты" active={isActive("presets")} onClick={() => onSelectPanel("presets")} />
      <RailButton side="right" icon={<AppIcon name="mcp" size={17} />} label="MCP" active={isActive("mcp")} onClick={() => onSelectPanel("mcp")} />
      <RailButton side="right" icon={<AppIcon name="plan" size={17} />} label="План" active={isActive("plan")} onClick={() => onSelectPanel("plan")} />
      <RailButton side="right" icon={<AppIcon name="gitBranch" size={17} />} label="Дерево сессии" active={isActive("tree")} onClick={() => onSelectPanel("tree")} />
      <RailButton side="right" icon={<AppIcon name="command" size={17} />} label="Команды" active={isActive("commands")} onClick={() => onSelectPanel("commands")} />
      <RailButton side="right" icon={<AppIcon name="terminal" size={17} />} label="Терминал" active={mainTab === "terminal"} onClick={onToggleTerminal} />
      <div className="flex-1" />
      <RailButton side="right" icon={<AppIcon name="activity" size={17} />} label="Статус" active={isActive("status")} onClick={() => onSelectPanel("status")} />
      <RailButton side="right" icon={<AppIcon name="subagent" size={17} />} label="Субагенты" active={isActive("subagents")} onClick={() => onSelectPanel("subagents")} />
    </IconRail>
  );
}
