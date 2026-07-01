import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import clsx from "clsx";

type Props = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={clsx(
        "h-9 w-full rounded-lg border border-(--color-border) bg-(--color-bg-soft) px-3 py-1.5 text-sm text-(--color-fg) placeholder:text-(--color-fg-dim) shadow-sm focus:outline-none focus:border-(--color-accent)/55 focus:ring-2 focus:ring-(--color-accent)/15",
        className,
      )}
      {...rest}
    />
  );
});
