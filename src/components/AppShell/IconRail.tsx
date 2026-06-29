import type { ReactNode } from "react";
import { Tooltip } from "@mantine/core";
import clsx from "clsx";

interface RailButtonProps {
  icon: ReactNode;
  label: string;
  active?: boolean;
  onClick(): void;
  className?: string;
  side?: "left" | "right";
}

export function RailButton({ icon, label, active, onClick, className, side = "right" }: RailButtonProps) {
  return (
    <Tooltip
      label={label}
      position={side === "right" ? "left" : "right"}
      withinPortal
      withArrow
      classNames={{ tooltip: "pi-mantine-tooltip", arrow: "pi-mantine-tooltip-arrow" }}
    >
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        onClick={onClick}
        className={clsx(
          "group relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent)/25",
          active
            ? "bg-(--color-accent-soft) text-(--color-accent)"
            : "text-(--color-fg-mute) hover:bg-(--color-bg-mute) hover:text-(--color-fg)",
          className,
        )}
      >
        <span
          className={clsx(
            "absolute top-2 bottom-2 w-0.5 rounded-full bg-(--color-accent) opacity-0 transition-opacity",
            side === "left" ? "left-[-7px]" : "right-[-7px]",
            active && "opacity-100",
          )}
          aria-hidden="true"
        />
        {icon}
      </button>
    </Tooltip>
  );
}

interface IconRailProps {
  children: ReactNode;
  side: "left" | "right";
  className?: string;
}

export function IconRail({ children, side, className }: IconRailProps) {
  return (
    <nav
      aria-label={side === "left" ? "Основная навигация" : "Контекстная навигация"}
      className={clsx(
        "flex w-[50px] shrink-0 flex-col items-center gap-2 border-(--color-border-muted) bg-(--color-bg-soft) px-[7px] py-2",
        side === "left" ? "border-r" : "border-l",
        className,
      )}
    >
      {children}
    </nav>
  );
}
