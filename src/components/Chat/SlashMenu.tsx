import clsx from "clsx";
import type { ReactNode } from "react";

export interface SlashCommand {
  command: string;
  description: string;
  icon?: ReactNode;
}

export const BUILTIN_SLASH: SlashCommand[] = [
  { command: "/new", description: "Новая пустая сессия" },
  { command: "/forktab", description: "Новая сессия с памятью текущей" },
  { command: "/sessions", description: "Открыть список сессий" },
  { command: "/model", description: "Сменить модель" },
  { command: "/compact", description: "Сжать контекст вручную" },
  { command: "/settings", description: "Открыть настройки" },
  { command: "/cd", description: "Сменить рабочую директорию агента" },
  { command: "/pwd", description: "Показать рабочую директорию агента" },
  { command: "/ls", description: "Показать файлы в директории" },
  { command: "/search", description: "Поиск по prompt истории" },
  { command: "/execute", description: "Выполнить текущий план" },
  { command: "/btw", description: "Попутный вопрос в текущем контексте" },
  { command: "/abort", description: "Прервать стриминг" },
  { command: "/clipboard", description: "Показать содержимое буфера обмена" },
];

interface Props {
  query: string;
  highlight: number;
  onPick: (cmd: string) => void;
  onHover: (i: number) => void;
}

export function SlashMenu({ query, highlight, onPick, onHover }: Props) {
  const q = query.trim().split(/\s+/, 1)[0]?.toLowerCase() ?? "";
  const items = BUILTIN_SLASH.filter((c) => c.command.toLowerCase().startsWith(q));
  if (items.length === 0) return null;
  return (
    <div className="absolute left-3 right-3 bottom-full mb-2 max-h-56 overflow-y-auto bg-(--color-bg-soft) border border-(--color-border) rounded-md shadow-2xl text-xs">
      {items.map((it, i) => (
        <button
          key={it.command}
          type="button"
          onMouseEnter={() => onHover(i)}
          onClick={() => onPick(it.command)}
          className={clsx(
            "w-full text-left px-3 py-1.5 flex items-center gap-2",
            i === highlight ? "bg-(--color-bg-mute)" : "hover:bg-(--color-bg-mute)/60",
          )}
        >
          <span className="font-mono text-(--color-accent) w-24">{it.command}</span>
          <span className="text-(--color-fg-mute)">{it.description}</span>
        </button>
      ))}
    </div>
  );
}
