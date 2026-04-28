import { useState } from "react";
import { ChevronDown, ChevronRight, Sparkles } from "lucide-react";

/**
 * Сворачиваемый блок для `/skill:NAME` токенов в сообщениях.
 * Аналогично `ThinkingBlock`: по умолчанию схлопнут, показывает имя скилла
 * и preview первых символов содержимого; при клике — раскрывает полный
 * текст (тело SKILL.md, если pi его инлайнит, либо пусто).
 */
export function SkillBlock({ name, body }: { name: string; body: string }) {
  const [open, setOpen] = useState(false);
  const hasBody = body.trim().length > 0;
  const preview = hasBody ? body.replace(/\s+/g, " ").slice(0, 80) : "";

  return (
    <div className="my-1 rounded-md border border-(--color-accent)/30 bg-(--color-accent-soft)/15 text-xs">
      <button
        type="button"
        onClick={() => hasBody && setOpen((v) => !v)}
        className={
          "w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-left " +
          (hasBody ? "hover:bg-(--color-accent-soft)/30 cursor-pointer" : "cursor-default")
        }
        disabled={!hasBody}
      >
        {hasBody ? (
          open ? (
            <ChevronDown size={12} className="text-(--color-accent)" />
          ) : (
            <ChevronRight size={12} className="text-(--color-accent)" />
          )
        ) : (
          <span className="w-3" />
        )}
        <Sparkles size={12} className="text-(--color-accent)" />
        <span className="text-(--color-accent) font-mono">/skill:{name}</span>
        {hasBody && !open && (
          <span className="text-(--color-fg-dim) truncate flex-1">
            {" · "}
            {preview}
          </span>
        )}
      </button>
      {open && hasBody && (
        <div className="px-3 pb-2 whitespace-pre-wrap font-mono text-[11px] text-(--color-fg-mute)">
          {body}
        </div>
      )}
    </div>
  );
}
