import type { ReactNode } from "react";
import { useState } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import clsx from "clsx";
import { popoverContentVariants, softEase } from "@/lib/motionPresets";

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
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const actualOpen = open ?? uncontrolledOpen;
  const setActualOpen = (next: boolean) => {
    setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  const reduceMotion = useReducedMotion();

  return (
    <PopoverPrimitive.Root open={actualOpen} onOpenChange={setActualOpen} modal={modal}>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <AnimatePresence initial={false}>
        {actualOpen && (
          <PopoverPrimitive.Portal forceMount>
            <PopoverPrimitive.Content
              forceMount
              asChild
              align={align}
              side={side}
              sideOffset={sideOffset}
              collisionPadding={10}
              avoidCollisions
            >
              <motion.div
                className={clsx(
                  "z-50 rounded-xl border border-(--color-border) bg-(--color-bg-soft) text-(--color-fg) shadow-xl outline-none",
                  className,
                )}
                initial="hidden"
                animate="visible"
                exit="exit"
                variants={popoverContentVariants(Boolean(reduceMotion))}
                transition={softEase}
              >
                {children}
              </motion.div>
            </PopoverPrimitive.Content>
          </PopoverPrimitive.Portal>
        )}
      </AnimatePresence>
    </PopoverPrimitive.Root>
  );
}
