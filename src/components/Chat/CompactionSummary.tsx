import { AppIcon } from "@/components/ui/AppIcon";
import { Chip } from "@/components/ui/Chip";
import { t } from "@/i18n/ru";

function fmtTokens(n: number): string {
  return Math.round(n).toLocaleString("ru-RU");
}

interface CompactionSummaryProps {
  tokensBefore?: number;
  tokensAfter?: number;
}

export function CompactionSummary({ tokensBefore, tokensAfter }: CompactionSummaryProps) {
  const hasNumbers = tokensBefore != null && tokensAfter != null && tokensBefore > 0;
  const saved = hasNumbers ? Math.max(0, tokensBefore! - tokensAfter!) : undefined;
  const percent = hasNumbers && saved != null ? Math.round((saved / tokensBefore!) * 100) : undefined;

  return (
    <div className="inline-flex items-center gap-2 rounded-lg border border-(--color-warn)/25 bg-(--color-warn)/8 px-3 py-1.5 text-xs text-(--color-fg-mute)">
      <AppIcon name="compact" size={13} className="shrink-0 text-(--color-warn)" />
      <span className="font-medium text-(--color-fg)">{t.chat.compactionTitle}</span>
      {hasNumbers && (
        <>
          <span className="text-(--color-fg-dim)">·</span>
          <span className="font-mono">
            {fmtTokens(tokensBefore!)} → {fmtTokens(tokensAfter!)}
          </span>
          <Chip size="xs" tone="warning" variant="health">
            −{percent}%
          </Chip>
        </>
      )}
    </div>
  );
}
