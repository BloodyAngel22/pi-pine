import type { ReactNode } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import clsx from "clsx";

interface TooltipProps {
  label: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}

export function Tooltip({ label, children, side = "top", className }: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={350} skipDelayDuration={120}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={8}
            collisionPadding={8}
            className={clsx(
              "z-50 max-w-[240px] rounded-md border border-(--color-border) bg-(--color-bg-soft) px-2 py-1 text-[11px] text-(--color-fg) shadow-lg outline-none",
              "data-[state=delayed-open]:animate-[pi-popover-in_140ms_cubic-bezier(0.16,1,0.3,1)]",
              className,
            )}
          >
            {label}
            <TooltipPrimitive.Arrow className="fill-(--color-bg-soft)" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
