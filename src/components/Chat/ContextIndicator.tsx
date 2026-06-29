import { useChat } from "@/store/chat";

function fmtTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 100000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return Math.round(n / 1000) + "k";
}

interface ContextIndicatorProps {
  variant?: "statusbar" | "composer";
}

export function ContextIndicator({ variant = "statusbar" }: ContextIndicatorProps) {
  const agent = useChat((s) => s.agentState);
  const stats = useChat((s) => s.sessionStats);
  const contextUsage = stats?.contextUsage;
  const contextWindow = contextUsage?.contextWindow ?? agent?.model?.contextWindow ?? 0;
  const contextTokens = contextUsage?.tokens ?? null;

  const pctRaw =
    contextUsage?.percent ??
    (contextTokens != null && contextWindow > 0 ? (contextTokens / contextWindow) * 100 : null);

  if (variant === "statusbar" && pctRaw == null && contextWindow <= 0) return null;
  const pct = Math.min(Math.max(pctRaw ?? 0, 0), 100);
  const pctRounded = pctRaw == null ? null : Math.round(pct);

  let color = "var(--color-success)";
  let pulse = false;
  if (pct > 95) {
    color = "var(--color-danger)";
    pulse = true;
  } else if (pct > 90) {
    color = "var(--color-danger)";
  } else if (pct > 70) {
    color = "var(--color-warn)";
  }

  const size = variant === "statusbar" ? 18 : 14;
  const strokeWidth = variant === "statusbar" ? 3 : 2.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);

  const tooltip =
    contextTokens != null && pctRounded != null && contextWindow > 0
      ? `context: ${fmtTokens(contextTokens)} / ${fmtTokens(contextWindow)} (${pctRounded}%)`
      : contextWindow > 0
        ? `context: unknown / ${fmtTokens(contextWindow)}`
        : "context: unknown";

  const indicator = (
    <span
      className={
        variant === "composer"
          ? "inline-flex items-center gap-1 h-7 px-1.5 rounded-md text-[10px] text-(--color-fg-mute) hover:bg-(--color-bg-mute) transition-colors"
          : "pi-statusbar-item"
      }
      title={tooltip}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className={pulse ? "animate-pulse" : ""}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="font-mono">{pctRounded == null ? "?" : pctRounded}%</span>
    </span>
  );

  if (variant === "composer") return indicator;

  return (
    <>
      <span className="pi-statusbar-sep">·</span>
      {indicator}
    </>
  );
}
