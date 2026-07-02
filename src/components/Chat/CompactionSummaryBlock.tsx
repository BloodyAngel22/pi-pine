import { useState } from "react";
import { ChevronDown, ChevronRight } from "@/components/ui/icons/compat";
import { AppIcon } from "@/components/ui/AppIcon";
import { t } from "@/i18n/ru";
import { Markdown } from "./Markdown";

function fmtTokens(n: number): string {
  return Math.round(n).toLocaleString("ru-RU");
}

interface Props {
  text: string;
  tokensBefore?: number;
}

export function CompactionSummaryBlock({ text, tokensBefore }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-(--color-warn)/25 bg-(--color-warn)/8 text-xs not-italic">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-(--color-warn)/10 rounded-lg text-left"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <AppIcon name="compact" size={13} className="shrink-0 text-(--color-warn)" />
        <span className="font-medium text-(--color-fg)">{t.chat.compactionTitle}</span>
        {tokensBefore != null && (
          <span className="font-mono text-(--color-fg-dim)">~{fmtTokens(tokensBefore)} токенов</span>
        )}
      </button>
      {open && (
        <div className="px-3 pb-2.5 pt-0.5 border-t border-(--color-warn)/20 text-(--color-fg-mute)">
          <Markdown text={text} />
        </div>
      )}
    </div>
  );
}
