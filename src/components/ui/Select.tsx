import type { ReactNode } from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import clsx from "clsx";

export interface SelectOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

interface SelectProps {
  value: string;
  onValueChange(value: string): void;
  options: SelectOption[];
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
}

export function Select({ value, onValueChange, options, placeholder, ariaLabel, className, disabled }: SelectProps) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        className={clsx(
          "inline-flex h-9 min-w-[150px] items-center justify-between gap-2 rounded-lg border border-(--color-border) bg-(--color-bg-soft) px-3 text-sm text-(--color-fg) outline-none transition-colors",
          "hover:bg-(--color-bg-mute) focus-visible:ring-2 focus-visible:ring-(--color-accent)/25 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <ChevronDown size={14} className="shrink-0 text-(--color-fg-dim)" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          collisionPadding={8}
          className="z-50 max-h-[280px] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-(--color-border) bg-(--color-bg-soft) text-(--color-fg) shadow-xl outline-none data-[state=open]:animate-[pi-popover-in_140ms_cubic-bezier(0.16,1,0.3,1)]"
        >
          <SelectPrimitive.ScrollUpButton className="flex h-6 items-center justify-center text-(--color-fg-dim)">
            <ChevronUp size={13} />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="p-1">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className="relative flex h-8 cursor-default select-none items-center rounded-lg py-1.5 pl-7 pr-2 text-sm outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-(--color-bg-mute) data-[state=checked]:bg-(--color-accent-soft) data-[state=checked]:text-(--color-accent) data-[disabled]:opacity-50"
              >
                <SelectPrimitive.ItemIndicator className="absolute left-2 inline-flex items-center">
                  <Check size={13} />
                </SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="flex h-6 items-center justify-center text-(--color-fg-dim)">
            <ChevronDown size={13} />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
