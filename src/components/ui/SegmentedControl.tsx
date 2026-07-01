import clsx from "clsx";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  title?: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  options: SegmentOption<T>[];
  onChange(value: T): void;
  ariaLabel: string;
  className?: string;
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={clsx(
        "inline-flex items-center rounded-lg border border-(--color-border) bg-(--color-bg-mute) p-0.5",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.title ?? option.label}
            onClick={() => onChange(option.value)}
            className={clsx(
              "h-7 rounded-md px-2.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent)/25",
              active
                ? "bg-(--color-bg-soft) text-(--color-fg) shadow-sm"
                : "text-(--color-fg-mute) hover:text-(--color-fg)",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
