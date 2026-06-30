import { useState } from "react";
import { ChevronDown, ChevronRight, Brain } from "lucide-react";
import { t } from "@/i18n/ru";

export function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pi-chat-scaled my-1 rounded-md border border-(--color-border) bg-(--color-bg-soft)/60 text-xs italic text-(--color-fg-mute)">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-(--color-bg-mute) rounded-md text-left"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Brain size={12} />
        <span className="text-(--color-fg-mute)">{t.chat.thinking}</span>
        {!open && (
          <span className="text-(--color-fg-dim) truncate flex-1">
            {" · "}
            {text.slice(0, 80)}
          </span>
        )}
      </button>
      {open && (
        <div className="px-3 pb-2 whitespace-pre-wrap font-mono text-[11px] text-(--color-fg-mute)">
          {text}
        </div>
      )}
    </div>
  );
}
