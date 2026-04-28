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
        "w-full bg-(--color-bg) border border-(--color-border) rounded-md px-2.5 py-1.5 text-sm text-(--color-fg) placeholder:text-(--color-fg-dim) focus:outline-none focus:border-(--color-accent)/50 focus:ring-1 focus:ring-(--color-accent)/20",
        className,
      )}
      {...rest}
    />
  );
});
