import { forwardRef } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import clsx from "clsx";
import { StatusDot, type StatusDotTone } from "./StatusDot";

export type ChipTone = "neutral" | "accent" | "warning" | "danger" | "success";
export type ChipVariant = "context" | "mode" | "health" | "solid";
export type ChipSize = "xs" | "sm";

interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: ChipTone;
  variant?: ChipVariant;
  size?: ChipSize;
  icon?: ReactNode;
  dot?: boolean | StatusDotTone;
  pulseDot?: boolean;
  mono?: boolean;
  interactive?: boolean;
}

const sizeClasses: Record<ChipSize, string> = {
  xs: "h-5 gap-1 px-1.5 text-[10px]",
  sm: "h-6 gap-1.5 px-2 text-[11px]",
};

const toneClasses: Record<ChipTone, Record<ChipVariant, string>> = {
  neutral: {
    context: "border-(--color-border-muted) bg-(--color-bg-soft)/80 text-(--color-fg-mute) shadow-[inset_0_1px_0_color-mix(in_srgb,var(--color-bg-soft)_80%,white_20%)]",
    mode: "border-(--color-border) bg-(--color-bg-mute)/65 text-(--color-fg)",
    health: "border-(--color-border-muted) bg-(--color-bg-soft)/70 text-(--color-fg-mute)",
    solid: "border-(--color-border) bg-(--color-bg-mute) text-(--color-fg)",
  },
  accent: {
    context: "border-(--color-accent)/18 bg-(--color-accent-soft)/45 text-(--color-accent)",
    mode: "border-(--color-accent)/28 bg-(--color-accent)/10 text-(--color-accent) shadow-[inset_0_1px_0_color-mix(in_srgb,var(--color-accent)_18%,white_16%)]",
    health: "border-(--color-accent)/22 bg-(--color-accent)/8 text-(--color-accent)",
    solid: "border-(--color-accent)/35 bg-(--color-accent) text-white",
  },
  warning: {
    context: "border-(--color-warn)/18 bg-(--color-warn)/8 text-(--color-warn)",
    mode: "border-(--color-warn)/30 bg-(--color-warn)/12 text-(--color-warn) shadow-[inset_0_1px_0_color-mix(in_srgb,var(--color-warn)_20%,white_16%)]",
    health: "border-(--color-warn)/24 bg-(--color-warn)/8 text-(--color-warn)",
    solid: "border-(--color-warn)/35 bg-(--color-warn) text-white",
  },
  danger: {
    context: "border-(--color-danger)/20 bg-(--color-danger)/8 text-(--color-danger)",
    mode: "border-(--color-danger)/32 bg-(--color-danger)/12 text-(--color-danger) shadow-[inset_0_1px_0_color-mix(in_srgb,var(--color-danger)_20%,white_14%)]",
    health: "border-(--color-danger)/24 bg-(--color-danger)/8 text-(--color-danger)",
    solid: "border-(--color-danger)/40 bg-(--color-danger) text-white",
  },
  success: {
    context: "border-(--color-success)/18 bg-(--color-success)/8 text-(--color-success)",
    mode: "border-(--color-success)/28 bg-(--color-success)/10 text-(--color-success)",
    health: "border-(--color-success)/24 bg-(--color-success)/8 text-(--color-success)",
    solid: "border-(--color-success)/35 bg-(--color-success) text-white",
  },
};

const dotToneByChipTone: Record<ChipTone, StatusDotTone> = {
  neutral: "neutral",
  accent: "accent",
  warning: "warning",
  danger: "danger",
  success: "success",
};

export const Chip = forwardRef<HTMLSpanElement, ChipProps>(function Chip(
  {
    tone = "neutral",
    variant = "context",
    size = "sm",
    icon,
    dot,
    pulseDot,
    mono,
    interactive,
    className,
    children,
    ...rest
  },
  ref,
) {
  const resolvedDot = dot === true ? dotToneByChipTone[tone] : dot || undefined;

  return (
    <span
      ref={ref}
      className={clsx(
        "inline-flex max-w-full shrink-0 items-center rounded-full border font-medium leading-none transition-colors",
        "[&>svg]:shrink-0",
        sizeClasses[size],
        toneClasses[tone][variant],
        mono && "font-mono tracking-[-0.01em]",
        interactive && "cursor-pointer hover:brightness-105 active:brightness-95",
        className,
      )}
      {...rest}
    >
      {resolvedDot && <StatusDot tone={resolvedDot} pulse={pulseDot} />}
      {icon}
      {children}
    </span>
  );
});
