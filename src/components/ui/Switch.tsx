import clsx from "clsx";

interface SwitchProps {
  checked: boolean;
  onChange(checked: boolean): void;
  label?: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}

export function Switch({ checked, onChange, label, description, disabled, className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        "group inline-flex min-w-0 items-center gap-3 text-left disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      <span
        className={clsx(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-150 focus-within:outline-none",
          checked
            ? "border-(--color-accent) bg-(--color-accent)"
            : "border-(--color-border) bg-(--color-bg-mute)",
          "group-focus-visible:ring-2 group-focus-visible:ring-(--color-accent)/25",
        )}
      >
        <span
          className={clsx(
            "h-4 w-4 rounded-full bg-(--color-bg-soft) shadow-sm transition-transform duration-150",
            checked ? "translate-x-[17px]" : "translate-x-0.5",
          )}
        />
      </span>
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-xs font-medium text-(--color-fg)">{label}</span>}
          {description && <span className="block text-[11px] text-(--color-fg-mute)">{description}</span>}
        </span>
      )}
    </button>
  );
}
