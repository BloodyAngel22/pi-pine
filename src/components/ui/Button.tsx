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
  "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent)/25";
const variants: Record<Variant, string> = {
  primary:
    "bg-(--color-accent) text-white hover:bg-(--color-accent)/90 active:bg-(--color-accent)/80 shadow-sm",
  ghost:
    "bg-transparent text-(--color-fg-mute) hover:text-(--color-fg) hover:bg-(--color-bg-mute)",
  subtle:
    "border border-(--color-border) bg-(--color-bg-soft) text-(--color-fg) hover:bg-(--color-bg-mute)",
  danger:
    "border border-(--color-danger)/20 bg-(--color-danger)/10 text-(--color-danger) hover:bg-(--color-danger)/18",
};
const sizes: Record<Size, string> = {
  sm: "px-2.5 py-1 text-xs h-7",
  md: "px-3 py-1.5 text-sm h-9",
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
