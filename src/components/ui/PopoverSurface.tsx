import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import clsx from "clsx";
import { popoverContentVariants, softEase } from "@/lib/motionPresets";

interface PopoverSurfaceProps {
  children: ReactNode;
  className?: string;
  align?: "left" | "right";
  width?: string;
}

export function PopoverSurface({ children, className, align = "left", width }: PopoverSurfaceProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={popoverContentVariants(Boolean(reduceMotion))}
      transition={softEase}
      className={clsx(
        "absolute z-40 rounded-xl border border-(--color-border) bg-(--color-bg-soft) shadow-[0_18px_50px_-24px_rgba(0,0,0,0.35)]",
        align === "right" ? "right-0" : "left-0",
        className,
      )}
      style={{ width }}
    >
      {children}
    </motion.div>
  );
}
