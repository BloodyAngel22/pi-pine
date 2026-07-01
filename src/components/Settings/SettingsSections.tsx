import { Button } from "@/components/ui/Button";

export function SettingsStack({ children }: { children: React.ReactNode }) {
  return <div className="space-y-5">{children}</div>;
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-(--color-fg-dim)">{title}</div>
      <div className="rounded-xl border border-(--color-border-muted) bg-(--color-bg-soft) p-3">{children}</div>
    </section>
  );
}

export function Hint({ children }: { children: React.ReactNode }) {
  return <div className="mt-2 text-[11px] leading-relaxed text-(--color-fg-dim)">{children}</div>;
}

export function RangeControl({
  value,
  min,
  max,
  step,
  onChange,
  onReset,
  resetLabel,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange(value: number): void;
  onReset(): void;
  resetLabel: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="min-w-0 flex-1 accent-(--color-accent)"
      />
      <span className="w-10 text-right font-mono text-xs text-(--color-fg-mute)">{Math.round(value * 100)}%</span>
      <Button variant="subtle" size="sm" onClick={() => onChange(Math.max(min, value - step))}>−</Button>
      <Button variant="subtle" size="sm" onClick={() => onChange(Math.min(max, value + step))}>+</Button>
      <Button variant="ghost" size="sm" onClick={onReset}>{resetLabel}</Button>
    </div>
  );
}
