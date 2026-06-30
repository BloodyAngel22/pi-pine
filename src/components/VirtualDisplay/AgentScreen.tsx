import { useEffect } from "react";
import { X, Play, Square, Monitor } from "@/components/ui/icons/compat";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { useVirtualDisplay } from "@/store/virtualDisplay";
import clsx from "clsx";

export function AgentScreen() {
  const {
    status,
    screenshot,
    error,
    visible,
    start,
    stop,
    toggleVisible,
  } = useVirtualDisplay();

  // Listen for Escape key to close
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") toggleVisible();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, toggleVisible]);

  if (!visible) return null;

  const isRunning = status?.running ?? false;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[6vh] bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) toggleVisible();
      }}
    >
      <div className="bg-(--color-bg-soft) border border-(--color-border) rounded-lg shadow-2xl flex flex-col max-h-[88vh] w-[800px] max-w-[95vw] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-(--color-border)">
          <div className="flex items-center gap-2">
            <Monitor size={14} className="text-(--color-fg-dim)" />
            <h2 className="text-sm font-semibold">Экран агента</h2>
            {isRunning && (
              <Chip size="xs" tone="accent" variant="health" dot="accent" pulseDot>
                active
              </Chip>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={toggleVisible} icon={<X size={14} />} />
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-4 flex-1 flex flex-col items-center gap-3">
          {error && (
            <div className="w-full px-3 py-2 rounded-md bg-(--color-danger)/10 text-(--color-danger) text-xs">
              {error}
            </div>
          )}

          {!isRunning ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-(--color-fg-dim)">
              <Monitor size={48} className="opacity-30" />
              <p className="text-sm text-center max-w-xs">
                Виртуальный дисплей не запущен. Запустите его, чтобы видеть экран агента.
              </p>
              <Button
                variant="primary"
                size="md"
                icon={<Play size={14} />}
                onClick={() => start()}
              >
                Запустить изолированный экран
              </Button>
            </div>
          ) : !screenshot ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-(--color-fg-dim)">
              <div className="w-8 h-8 border-2 border-(--color-accent) border-t-transparent rounded-full animate-spin" />
              <p className="text-sm">Загрузка изображения экрана...</p>
            </div>
          ) : (
            <>
              <img
                src={screenshot}
                alt="Virtual display screenshot"
                className="max-w-full h-auto rounded-md border border-(--color-border) shadow-sm"
                style={{ maxHeight: "65vh" }}
              />
            </>
          )}

          {/* Status info */}
          {status && (
            <div className="w-full flex items-center justify-center gap-4 text-[10px] text-(--color-fg-dim) font-mono">
              <span>display: {status.display}</span>
              <span className="text-(--color-border)">·</span>
              <span>
                {status.width}×{status.height}
              </span>
              <span className="text-(--color-border)">·</span>
              <span>VNC: {status.vnc_port}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        {isRunning && (
          <div className="px-4 py-2.5 border-t border-(--color-border) flex items-center justify-end gap-2">
            <Button
              variant="danger"
              size="sm"
              icon={<Square size={12} />}
              onClick={() => stop()}
            >
              Остановить дисплей
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
