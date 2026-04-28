import { TreePine, Check, Loader2 } from "lucide-react";
import clsx from "clsx";

export type BootStage = "init" | "detect" | "starting" | "ready";

interface StageDef {
  key: BootStage;
  label: string;
}

const STAGES: StageDef[] = [
  { key: "init", label: "Инициализация" },
  { key: "detect", label: "Определяем окружение" },
  { key: "starting", label: "Запускаем pi" },
];

const ORDER: Record<BootStage, number> = {
  init: 0,
  detect: 1,
  starting: 2,
  ready: 3,
};

export function SplashScreen({
  stage,
  cwd,
  note,
}: {
  stage: BootStage;
  cwd?: string | null;
  note?: string | null;
}) {
  const cur = ORDER[stage];

  return (
    <div className="h-full w-full flex items-center justify-center p-8 bg-(--color-bg)">
      <div className="splash-card w-full max-w-md rounded-xl border border-(--color-border) bg-(--color-bg-soft)/80 backdrop-blur-md shadow-2xl px-8 py-7 space-y-6">
        <div className="flex items-center gap-3">
          <div className="splash-logo">
            <TreePine size={28} className="text-(--color-accent)" />
          </div>
          <div>
            <div className="text-base font-semibold tracking-tight">pi-pine</div>
            <div className="text-[11px] text-(--color-fg-mute)">
              terminal-grade UI для pi coding agent
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {STAGES.map((s) => {
            const idx = ORDER[s.key];
            const done = idx < cur;
            const active = idx === cur;
            return (
              <div
                key={s.key}
                className={clsx(
                  "flex items-center gap-2.5 text-xs transition-opacity",
                  done && "text-(--color-fg-mute)",
                  active && "text-(--color-fg)",
                  !done && !active && "text-(--color-fg-dim) opacity-60",
                )}
              >
                <span className="w-4 h-4 inline-flex items-center justify-center shrink-0">
                  {done ? (
                    <Check size={12} className="text-(--color-accent)" />
                  ) : active ? (
                    <Loader2
                      size={12}
                      className="text-(--color-accent) animate-spin"
                    />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-(--color-fg-dim)" />
                  )}
                </span>
                <span className="flex-1">{s.label}</span>
                {active && (
                  <span className="text-(--color-fg-dim) text-[10px]">…</span>
                )}
              </div>
            );
          })}
        </div>

        {cwd && (
          <div className="border-t border-(--color-border)/60 pt-3 text-[11px] flex items-center gap-2 text-(--color-fg-mute)">
            <span className="text-(--color-fg-dim)">cwd:</span>
            <span className="font-mono truncate flex-1" title={cwd}>
              {cwd}
            </span>
          </div>
        )}

        {note && (
          <div className="text-[11px] text-(--color-warn) bg-(--color-warn)/10 border border-(--color-warn)/30 rounded-md px-2.5 py-2">
            {note}
          </div>
        )}
      </div>
    </div>
  );
}
