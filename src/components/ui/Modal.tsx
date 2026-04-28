import type { ReactNode } from "react";
import { useEffect } from "react";
import { X } from "lucide-react";
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
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-(--color-bg-soft) border border-(--color-border) rounded-lg shadow-2xl flex flex-col max-h-[80vh] overflow-hidden"
        style={{ width }}
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-(--color-border)">
          <h2 className="text-sm font-semibold">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} icon={<X size={14} />} />
        </div>
        <div className="overflow-y-auto p-4 flex-1">{children}</div>
        {footer && (
          <div className="px-4 py-2.5 border-t border-(--color-border) flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
