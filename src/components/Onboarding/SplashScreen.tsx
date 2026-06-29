import { useEffect, useRef } from "react";
import { TreePine, Check, Loader2 } from "lucide-react";
import clsx from "clsx";

export type BootStage = "init" | "detect" | "starting" | "ready";
export type BootTone = "normal" | "muted" | "warn" | "danger" | "success";

export interface BootDetail {
  label: string;
  value: string;
  tone?: BootTone;
}

export interface BootLogEntry {
  id: string;
  text: string;
  tone?: BootTone;
}

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

const toneClass: Record<BootTone, string> = {
  normal: "text-(--color-fg-mute)",
  muted: "text-(--color-fg-dim)",
  warn: "text-(--color-warn)",
  danger: "text-(--color-danger)",
  success: "text-(--color-accent)",
};

export function SplashScreen({
  stage,
  cwd,
  note,
  currentAction,
  details = [],
  logs = [],
}: {
  stage: BootStage;
  cwd?: string | null;
  note?: string | null;
  currentAction?: string | null;
  details?: BootDetail[];
  logs?: BootLogEntry[];
}) {
  const cur = ORDER[stage];
  const hasDetails = details.length > 0;
  const hasLogs = logs.length > 0;
  const logStreamRef = useRef<HTMLDivElement | null>(null);
  const lastLog = logs.length > 0 ? logs[logs.length - 1] : undefined;

  useEffect(() => {
    const el = logStreamRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [logs.length, lastLog?.id, lastLog?.text]);

  return (
    <div className="h-full w-full flex items-center justify-center p-6 bg-(--color-bg)">
      <div className="splash-card w-full max-w-2xl max-h-full overflow-hidden rounded-xl border border-(--color-border) bg-(--color-bg-soft)/80 backdrop-blur-md shadow-2xl px-8 py-7 space-y-5">
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

        {currentAction && (
          <div className="rounded-md border border-(--color-border)/70 bg-(--color-bg)/40 px-3 py-2 text-[11px] text-(--color-fg-mute) flex items-center gap-2">
            <Loader2 size={12} className="text-(--color-accent) animate-spin shrink-0" />
            <span className="truncate" title={currentAction}>{currentAction}</span>
          </div>
        )}

        {(cwd || hasDetails) && (
          <div className="border-t border-(--color-border)/60 pt-3 space-y-1.5 text-[11px]">
            {cwd && !details.some((d) => d.label.toLowerCase() === "cwd") && (
              <DetailRow label="cwd" value={cwd} />
            )}
            {details.map((detail) => (
              <DetailRow
                key={`${detail.label}:${detail.value}`}
                label={detail.label}
                value={detail.value}
                tone={detail.tone}
              />
            ))}
          </div>
        )}

        {hasLogs && (
          <div className="rounded-md border border-(--color-border)/60 bg-(--color-bg)/30 px-3 py-2">
            <div className="mb-1.5 text-[10px] uppercase tracking-wide text-(--color-fg-dim)">
              Последние события
            </div>
            <div ref={logStreamRef} className="splash-log-stream space-y-1 max-h-28 overflow-y-auto pr-1">
              {logs.map((entry, index) => (
                <div
                  key={entry.id}
                  className={clsx(
                    "text-[11px] leading-snug truncate",
                    toneClass[entry.tone ?? "muted"],
                    index === logs.length - 1 && "splash-log-newest",
                  )}
                  title={entry.text}
                >
                  {entry.text}
                </div>
              ))}
            </div>
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

function DetailRow({
  label,
  value,
  tone = "normal",
}: {
  label: string;
  value: string;
  tone?: BootTone;
}) {
  return (
    <div className="flex items-center gap-2 text-(--color-fg-mute)">
      <span className="text-(--color-fg-dim) shrink-0 min-w-20">{label}:</span>
      <span className={clsx("font-mono truncate flex-1", toneClass[tone])} title={value}>
        {value}
      </span>
    </div>
  );
}
