import { Info, AlertTriangle, AlertCircle, CheckCircle2, X } from "@/components/ui/icons/compat";
import clsx from "clsx";
import { useExt, type NotifyKind } from "@/store/ext";

const ICONS: Record<NotifyKind, React.ReactNode> = {
  info: <Info size={14} />,
  warning: <AlertTriangle size={14} />,
  error: <AlertCircle size={14} />,
  success: <CheckCircle2 size={14} />,
};

const COLORS: Record<NotifyKind, string> = {
  info: "border-(--color-accent)/40 bg-(--color-accent-soft)/30 text-(--color-fg)",
  warning: "border-(--color-warn)/40 bg-(--color-warn)/15 text-(--color-warn)",
  error: "border-(--color-danger)/40 bg-(--color-danger)/15 text-(--color-danger)",
  success: "border-(--color-success)/40 bg-(--color-success)/15 text-(--color-success)",
};

export function Toasts() {
  const toasts = useExt((s) => s.toasts);
  const dismiss = useExt((s) => s.dismissToast);
  if (toasts.length === 0) return null;
  return (
    <div className="fixed top-3 right-3 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={clsx(
            "flex items-start gap-2 px-3 py-2 rounded border text-xs shadow-lg backdrop-blur",
            COLORS[t.kind],
          )}
        >
          <span className="mt-0.5">{ICONS[t.kind]}</span>
          <span className="flex-1 whitespace-pre-wrap">{t.message}</span>
          <button
            type="button"
            className="text-(--color-fg-dim) hover:text-(--color-fg)"
            onClick={() => dismiss(t.id)}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
