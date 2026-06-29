import { useState } from "react";
import { X, Layers, Database, Activity, ListTodo, GitBranch, Bot, Command } from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { ModelsTab } from "./ModelsTab";
import { McpTab } from "./McpTab";
import { StatusTab } from "./StatusTab";
import { PlanTab } from "./PlanTab";
import { TreeTab } from "./TreeTab";
import { SubagentsTab } from "./SubagentsTab";
import { CommandsTab } from "./CommandsTab";
import { PresetsTab } from "./PresetsTab";
import { useUiPrefs, SIDEPANEL_MIN, SIDEPANEL_MAX } from "@/store/uiPrefs";
import { useResize } from "@/lib/useResize";
import { useChat } from "@/store/chat";

export type SidePanelTab = "models" | "presets" | "mcp" | "status" | "plan" | "tree" | "subagents" | "commands";
const SIDE_PANEL_TAB_KEY = "pi-pine.sidePanelTab";
const isTab = (value: string | null): value is SidePanelTab =>
  value === "models" || value === "presets" || value === "mcp" || value === "status" || value === "plan" || value === "tree" || value === "subagents" || value === "commands";

const tabMeta: Record<SidePanelTab, { title: string; hint: string; icon: React.ReactNode }> = {
  models: { title: "Модели", hint: "Выбор provider/model для текущей сессии", icon: <Layers size={15} /> },
  presets: { title: "Пресеты", hint: "Готовые конфигурации агента", icon: <Bot size={15} /> },
  mcp: { title: "MCP", hint: "Серверы расширений и их статус", icon: <Database size={15} /> },
  status: { title: "Статус", hint: "RPC, окружение и служебная диагностика", icon: <Activity size={15} /> },
  plan: { title: "План", hint: "Plan mode и файл текущего плана", icon: <ListTodo size={15} /> },
  tree: { title: "Дерево сессии", hint: "Ветки диалога, навигация и restore checkpoints", icon: <GitBranch size={15} /> },
  subagents: { title: "Agents", hint: "Подагенты и экран выполнения", icon: <Bot size={15} /> },
  commands: { title: "Команды", hint: "Доступные slash-команды и расширения", icon: <Command size={15} /> },
};

export function SidePanel({ onClose, activeTab }: { onClose: () => void; activeTab?: SidePanelTab; onTabChange?: (tab: SidePanelTab) => void }) {
  const planMode = useChat((s) => s.planMode);
  const [internalTab] = useState<SidePanelTab>(() => {
    const saved = localStorage.getItem(SIDE_PANEL_TAB_KEY);
    return isTab(saved) ? saved : planMode ? "plan" : "models";
  });
  const tab = activeTab ?? internalTab;
  const width = useUiPrefs((s) => s.sidePanelWidth);
  const setWidth = useUiPrefs((s) => s.setSidePanelWidth);
  const resize = useResize({
    edge: "left",
    initial: width,
    min: SIDEPANEL_MIN,
    max: SIDEPANEL_MAX,
    onChange: setWidth,
  });
  const meta = tabMeta[tab];

  return (
    <aside
      className="relative flex min-w-0 shrink-0 flex-col overflow-hidden border-l border-(--color-border) bg-(--color-bg-soft)"
      style={{ width }}
      aria-label={meta.title}
    >
      <div className={clsx("pi-resizer pi-resizer-left", resize.active && "pi-resizer-active")} onMouseDown={resize.onMouseDown} />
      <div className="flex items-start gap-2 border-b border-(--color-border-muted) px-3 py-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-(--color-accent-soft) text-(--color-accent)">{meta.icon}</div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-(--color-fg)">{meta.title}</div>
          <div className="mt-0.5 truncate text-[11px] text-(--color-fg-dim)">{meta.hint}</div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} icon={<X size={12} />} className="shrink-0" aria-label="Закрыть панель" />
      </div>
      <div className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto pt-2">
        {tab === "models" && <ModelsTab />}
        {tab === "presets" && <PresetsTab />}
        {tab === "mcp" && <McpTab />}
        {tab === "plan" && <PlanTab />}
        {tab === "tree" && <TreeTab />}
        {tab === "subagents" && <SubagentsTab />}
        {tab === "commands" && <CommandsTab />}
        {tab === "status" && <StatusTab />}
      </div>
      <div className="border-t border-(--color-border-muted) px-3 py-2 text-[10px] text-(--color-fg-dim)">
        Открыто из правого rail. Для другой панели нажмите её кнопку справа.
      </div>
    </aside>
  );
}
