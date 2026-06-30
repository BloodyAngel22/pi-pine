import clsx from "clsx";

export type StatusDotTone = "neutral" | "accent" | "success" | "warning" | "danger";

interface StatusDotProps {
  tone?: StatusDotTone;
  pulse?: boolean;
  className?: string;
}

const tones: Record<StatusDotTone, string> = {
  neutral: "bg-(--color-fg-dim)",
  accent: "bg-(--color-accent)",
  success: "bg-(--color-success)",
  warning: "bg-(--color-warn)",
  danger: "bg-(--color-danger)",
};

export function StatusDot({ tone = "neutral", pulse, className }: StatusDotProps) {
  return (
    <span
      className={clsx(
        "relative inline-flex h-1.5 w-1.5 shrink-0 rounded-full",
        tones[tone],
        pulse && "after:absolute after:inset-0 after:rounded-full after:bg-current after:opacity-35 after:animate-ping",
        className,
      )}
      aria-hidden="true"
    />
  );
}
