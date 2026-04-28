import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import clsx from "clsx";

type Variant = "primary" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}

const base =
  "inline-flex items-center gap-1.5 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed select-none focus:outline-none focus:ring-1 focus:ring-(--color-accent)/40";
const variants: Record<Variant, string> = {
  primary:
    "bg-(--color-accent) text-neutral-950 hover:bg-(--color-accent)/90 active:bg-(--color-accent)/80",
  ghost:
    "bg-transparent text-(--color-fg-mute) hover:text-(--color-fg) hover:bg-(--color-bg-mute)",
  subtle:
    "bg-(--color-bg-mute) text-(--color-fg) hover:bg-(--color-border)",
  danger:
    "bg-(--color-danger)/15 text-(--color-danger) hover:bg-(--color-danger)/25",
};
const sizes: Record<Size, string> = {
  sm: "px-2 py-1 text-xs h-7",
  md: "px-3 py-1.5 text-sm h-8",
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "ghost", size = "sm", icon, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={clsx(base, variants[variant], sizes[size], className)}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});
