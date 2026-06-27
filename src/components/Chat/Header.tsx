import { useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Menu, Settings as SettingsIcon, Plus, Cpu, Brain, Layers, Terminal, Folder, Bot } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useChat } from "@/store/chat";
import { useAgentsStore } from "@/store/agents";
import { shortenPath } from "@/utils/path";

interface Props {
  onToggleSidebar: () => void;
  onToggleSidePanel: () => void;
  onOpenSettings: () => void;
  onNewSession: () => void;
  onToggleBash: () => void;
}

export function Header({ onToggleSidebar, onToggleSidePanel, onOpenSettings, onNewSession, onToggleBash }: Props) {
  const agentState = useChat((s) => s.agentState);
  const setSessionName = useChat((s) => s.setSessionName);
  const cwd = useChat((s) => s.cwd);
  const home = useChat((s) => s.home);
  const changeCwd = useChat((s) => s.changeCwd);
  const planMode = useChat((s) => s.planMode);
  const togglePlanMode = useChat((s) => s.togglePlanMode);
  const activePreset = useAgentsStore((s) => s.activePreset);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const name = agentState?.sessionName || "Без названия";
  const model = agentState?.model;
  const cwdShort = shortenPath(cwd, home);

  const onPickCwd = async () => {
    const r = await openDialog({ multiple: false, directory: true, defaultPath: cwd });
    if (typeof r === "string" && r !== cwd) {
      await changeCwd(r);
    }
  };

  const startEdit = () => {
    setDraft(agentState?.sessionName ?? "");
    setEditing(true);
  };
  const submitEdit = async () => {
    setEditing(false);
    const v = draft.trim();
    if (v) await setSessionName(v);
  };

  return (
    <header className="h-10 shrink-0 border-b border-(--color-border) bg-(--color-bg) px-2 flex items-center gap-2">
      <Button variant="ghost" size="sm" onClick={onToggleSidebar} icon={<Menu size={14} />} />
      <button
        type="button"
        onClick={onPickCwd}
        title={`Сменить рабочую директорию (текущая: ${cwd})`}
        className="text-xs text-(--color-fg-mute) hover:text-(--color-fg) flex items-center gap-1 px-2 py-1 rounded hover:bg-(--color-bg-mute) max-w-[280px]"
      >
        <Folder size={12} />
        <span className="font-mono truncate">{cwdShort}</span>
      </button>
      <span className="text-(--color-fg-dim) text-xs">›</span>
      <div className="flex items-center gap-1.5 min-w-0">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={submitEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitEdit();
              if (e.key === "Escape") setEditing(false);
            }}
            className="text-sm bg-(--color-bg-mute) border border-(--color-border) rounded px-1.5 py-0.5 outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={startEdit}
            className="text-sm font-medium hover:text-(--color-accent) truncate max-w-[280px]"
            title={name}
          >
            {name}
          </button>
        )}
      </div>
      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={() => togglePlanMode()}
          className={
            "text-xs flex items-center gap-1 px-2 py-1 rounded transition-colors " +
            (planMode
              ? "bg-(--color-warn)/20 text-(--color-warn) border border-(--color-warn)/40"
              : "text-(--color-fg-mute) hover:text-(--color-fg) hover:bg-(--color-bg-mute)")
          }
          title="Режим планирования: pi пишет план в .pi/plans/<sessionId>.md и не редактирует код"
        >
          <span className="font-medium">Plan</span>
          <span className={"w-1.5 h-1.5 rounded-full " + (planMode ? "bg-(--color-warn)" : "bg-(--color-fg-dim)")} />
        </button>
        {activePreset && (
          <button
            type="button"
            onClick={() => {
              localStorage.setItem("pi-pine.sidePanelTab", "presets");
              onToggleSidePanel();
            }}
            className="text-xs text-(--color-accent) bg-(--color-accent-soft)/40 flex items-center gap-1 px-2 py-1 rounded hover:bg-(--color-accent-soft)/60"
            title={`Активный пресет: ${activePreset}`}
          >
            <Bot size={12} />
            <span className="font-mono truncate max-w-[140px]">{activePreset}</span>
          </button>
        )}
        {model && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="text-xs text-(--color-fg-mute) hover:text-(--color-fg) flex items-center gap-1 px-2 py-1 rounded hover:bg-(--color-bg-mute)"
            title={`${model.provider}/${model.id}`}
          >
            <Cpu size={12} />
            <span className="font-mono truncate max-w-[200px]">{model.id}</span>
          </button>
        )}
        {agentState && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="text-xs text-(--color-fg-mute) hover:text-(--color-fg) flex items-center gap-1 px-1.5 py-1 rounded hover:bg-(--color-bg-mute)"
            title={`thinking: ${agentState.thinkingLevel}`}
          >
            <Brain size={12} />
            <span>{agentState.thinkingLevel}</span>
          </button>
        )}
        <Button variant="ghost" size="sm" onClick={onToggleBash} icon={<Terminal size={14} />} title="Terminal (Ctrl+`)">
          Terminal
        </Button>
        <Button variant="ghost" size="sm" onClick={onNewSession} icon={<Plus size={14} />} title="Новая сессия (Ctrl+N)" />
        <Button variant="ghost" size="sm" onClick={onToggleSidePanel} icon={<Layers size={14} />} title="Модели/MCP/Статус (Ctrl+Shift+B)" />
        <Button variant="ghost" size="sm" onClick={onOpenSettings} icon={<SettingsIcon size={14} />} title="Настройки (Ctrl+,)" />
      </div>
    </header>
  );
}
