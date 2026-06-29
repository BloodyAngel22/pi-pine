import type { ReactNode } from "react";
import clsx from "clsx";

interface PopoverSurfaceProps {
  children: ReactNode;
  className?: string;
  align?: "left" | "right";
  width?: string;
}

export function PopoverSurface({ children, className, align = "left", width }: PopoverSurfaceProps) {
  return (
    <div
      className={clsx(
        "absolute z-40 rounded-xl border border-(--color-border) bg-(--color-bg-soft) shadow-[0_18px_50px_-24px_rgba(0,0,0,0.35)]",
        "animate-[pi-popover-in_140ms_cubic-bezier(0.22,1,0.36,1)]",
        align === "right" ? "right-0" : "left-0",
        className,
      )}
      style={{ width }}
    >
      {children}
    </div>
  );
}
