import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";

export type ActivityTone = "agent" | "tool" | "subagent" | "research" | "compact";
export type ActivitySize = "compact" | "sm" | "md" | "lg";

type ActivityPattern = "dots" | "bars" | "ring";

const PATTERNS: ActivityPattern[] = ["dots", "bars", "ring"];

function pickPattern(except?: ActivityPattern): ActivityPattern {
  const pool = except ? PATTERNS.filter((pattern) => pattern !== except) : PATTERNS;
  return pool[Math.floor(Math.random() * pool.length)] ?? "dots";
}

function nextDelayMs(): number {
  return 9000 + Math.floor(Math.random() * 3000);
}

interface ActivityIndicatorProps {
  active?: boolean;
  tone?: ActivityTone;
  size?: ActivitySize;
  label?: string;
  showLabel?: boolean;
  decorative?: boolean;
  className?: string;
}

/**
 * Нейтральный theme-aware индикатор активности.
 * Использует только текущий text/accent color и простые формы,
 * поэтому не привязан к конкретной визуальной теме.
 */
export function ActivityIndicator({
  active = true,
  tone = "agent",
  size = "sm",
  label = "Агент работает",
  showLabel = false,
  decorative = false,
  className,
}: ActivityIndicatorProps) {
  const initialPattern = useMemo(() => pickPattern(), []);
  const [pattern, setPattern] = useState<ActivityPattern>(initialPattern);

  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof window.setTimeout> | undefined;
    const schedule = () => {
      timer = window.setTimeout(() => {
        setPattern((current) => pickPattern(current));
        schedule();
      }, nextDelayMs());
    };
    schedule();
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [active]);

  const a11yProps = decorative
    ? { "aria-hidden": true }
    : { role: "status", "aria-live": "polite" as const, "aria-label": label };

  return (
    <span
      className={clsx("pi-activity", className)}
      data-active={active ? "true" : "false"}
      data-tone={tone}
      data-size={size}
      data-pattern={pattern}
      title={showLabel ? undefined : label}
      {...a11yProps}
    >
      <span className="pi-activity-glyph" aria-hidden="true">
        <span className="pi-activity-mark pi-activity-mark-a" />
        <span className="pi-activity-mark pi-activity-mark-b" />
        <span className="pi-activity-mark pi-activity-mark-c" />
      </span>
      {showLabel && <span className="pi-activity-label">{label}</span>}
    </span>
  );
}
