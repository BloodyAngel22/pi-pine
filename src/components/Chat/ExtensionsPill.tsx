import { useEffect, useRef, useState } from "react";
import { Plug, ChevronUp } from "lucide-react";
import clsx from "clsx";

/**
 * Пилюля-сводка для extension-статусов (`mcp`, `devin` и любых
 * пользовательских). По клику разворачивает popover со списком
 * `ключ → значение`.
 */
export function ExtensionsPill({
  items,
}: {
  items: [string, string][];
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (items.length === 0) return null;

  // Грубая эвристика: если хоть один статус содержит "error" / "fail" /
  // "✗" — индикатор красный. Иначе зелёный.
  const hasError = items.some(([, v]) =>
    /error|fail|✗|⚠/i.test(v),
  );

  return (
    <div className="relative inline-flex items-center" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          "pi-statusbar-pill",
          open && "pi-statusbar-pill-open",
        )}
        title={items.map(([k, v]) => `${k}: ${v}`).join("\n")}
      >
        <Plug size={11} />
        <span
          className={clsx(
            "w-1.5 h-1.5 rounded-full",
            hasError ? "bg-(--color-warn)" : "bg-(--color-accent)",
          )}
        />
        <span>{items.length} ext</span>
        <ChevronUp
          size={10}
          className={clsx(
            "transition-transform",
            !open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="pi-statusbar-popover">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-(--color-fg-dim) mb-1.5">
            Расширения
          </div>
          <div className="space-y-1">
            {items.map(([k, v]) => (
              <div
                key={k}
                className="flex items-baseline gap-2 text-xs"
                title={v}
              >
                <span className="font-mono text-(--color-fg-dim) shrink-0">
                  {k}
                </span>
                <span className="text-(--color-fg) flex-1 truncate">
                  {v}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
