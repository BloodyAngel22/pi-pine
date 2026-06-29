import type { ReactNode } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import clsx from "clsx";

interface PopoverProps {
  open?: boolean;
  onOpenChange?(open: boolean): void;
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
  className?: string;
  modal?: boolean;
}

export function Popover({
  open,
  onOpenChange,
  trigger,
  children,
  align = "end",
  side = "top",
  sideOffset = 8,
  className,
  modal = false,
}: PopoverProps) {
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange} modal={modal}>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align={align}
          side={side}
          sideOffset={sideOffset}
          collisionPadding={10}
          avoidCollisions
          className={clsx(
            "z-50 rounded-xl border border-(--color-border) bg-(--color-bg-soft) text-(--color-fg) shadow-xl outline-none data-[state=open]:animate-[pi-popover-in_140ms_cubic-bezier(0.16,1,0.3,1)]",
            className,
          )}
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
