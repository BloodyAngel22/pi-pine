import clsx from "clsx";
import type { ReactNode } from "react";
import { PopoverSurface } from "@/components/ui/PopoverSurface";

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
    <PopoverSurface className="bottom-full left-3 right-3 mb-2 max-h-56 overflow-y-auto p-1 text-xs">
      {items.map((it, i) => (
        <button
          key={it.command}
          type="button"
          onMouseEnter={() => onHover(i)}
          onClick={() => onPick(it.command)}
          className={clsx(
            "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left",
            i === highlight ? "bg-(--color-accent-soft)" : "hover:bg-(--color-bg-mute)/70",
          )}
        >
          <span className="font-mono text-(--color-accent) w-24">{it.command}</span>
          <span className="text-(--color-fg-mute)">{it.description}</span>
        </button>
      ))}
    </PopoverSurface>
  );
}
