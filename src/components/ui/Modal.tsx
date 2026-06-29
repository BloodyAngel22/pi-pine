import type { ReactNode } from "react";
import { useEffect } from "react";
import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { modalCardVariants, modalOverlayVariants, softEase } from "@/lib/motionPresets";
import { Button } from "./Button";

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}

export function Modal({ open, title, onClose, children, footer, width = "560px" }: Props) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-6 backdrop-blur-[2px]"
          initial="hidden"
          animate="visible"
          exit="exit"
          variants={modalOverlayVariants(Boolean(reduceMotion))}
          transition={softEase}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            className="flex max-h-[86vh] flex-col overflow-hidden rounded-2xl border border-(--color-border) bg-(--color-bg-soft) shadow-[0_24px_70px_-32px_rgba(0,0,0,0.55)]"
            style={{ width }}
            variants={modalCardVariants(Boolean(reduceMotion))}
            transition={softEase}
          >
        <div className="flex items-center justify-between border-b border-(--color-border-muted) px-4 py-3">
          <h2 className="text-sm font-semibold tracking-[-0.01em]">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} icon={<X size={14} />} aria-label="Закрыть" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-(--color-border-muted) bg-(--color-bg)/55 px-4 py-3">
            {footer}
          </div>
        )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
