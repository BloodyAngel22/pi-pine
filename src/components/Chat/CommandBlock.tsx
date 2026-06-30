import { useState } from "react";
import { ChevronDown, ChevronRight, Terminal } from "@/components/ui/icons/compat";

/**
 * Сворачиваемый блок для команды/скилла в сообщении пользователя.
 * Показывает название команды (e.g. `/commit-msg`) стилизованным чипом.
 * При клике раскрывает полное содержимое скилла (SKILL.md).
 *
 * Отличие от SkillBlock: это блок, добавленный пользователем (не ответ pi),
 * icon — Terminal вместо Sparkles, префикс `/` без `skill:`.
 */
export function CommandBlock({ name, content }: { name: string; content: string }) {
  const [open, setOpen] = useState(false);
  const hasContent = content.trim().length > 0;
  const preview = hasContent ? content.replace(/\s+/g, " ").slice(0, 80) : "";
  const displayName = name.startsWith("skill:") ? name.slice(6) : name;

  return (
    <div className="pi-chat-scaled my-1 rounded-md border border-(--color-warn)/40 bg-(--color-warn)/10 text-xs">
      <button
        type="button"
        onClick={() => hasContent && setOpen((v) => !v)}
        className={
          "w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-left " +
          (hasContent ? "hover:bg-(--color-warn)/15 cursor-pointer" : "cursor-default")
        }
        disabled={!hasContent}
      >
        {hasContent ? (
          open ? (
            <ChevronDown size={12} className="text-(--color-warn)" />
          ) : (
            <ChevronRight size={12} className="text-(--color-warn)" />
          )
        ) : (
          <span className="w-3" />
        )}
        <Terminal size={12} className="text-(--color-warn)" />
        <span className="text-(--color-warn) font-semibold font-mono">/{displayName}</span>
        {hasContent && !open && (
          <span className="text-(--color-fg-dim) truncate flex-1">
            {" · "}
            {preview}
          </span>
        )}
      </button>
      {open && hasContent && (
        <div className="px-3 pb-2 whitespace-pre-wrap font-mono text-[11px] text-(--color-fg) bg-(--color-bg)/50 rounded-b-md border-t border-(--color-warn)/20">
          {content}
        </div>
      )}
    </div>
  );
}
