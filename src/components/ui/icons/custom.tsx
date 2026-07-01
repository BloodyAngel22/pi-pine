import type { SVGProps } from "react";

export type CustomIconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  strokeWidth?: number | string;
};

function CustomIcon({
  size = 16,
  strokeWidth = 1.8,
  children,
  ...props
}: CustomIconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function PiPineLogoMark({ size = 16, ...props }: CustomIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 800 800"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <polygon points="408.28,305.36 490.59,61.93 440.15,313.9 458.49,325.14 580.31,219.69 474.86,341.51 486.1,359.85 738.07,309.41 494.64,391.72 494.08,413.22 646.31,466 488.08,435.59 477.82,454.49 647.49,647.49 454.49,477.82 435.59,488.08 466,646.31 413.22,494.08 391.72,494.64 309.41,738.07 359.85,486.1 341.51,474.86 219.69,580.31 325.14,458.49 313.9,440.15 61.93,490.59 305.36,408.28 305.92,386.78 153.69,334 311.92,364.41 322.18,345.51 152.51,152.51 345.51,322.18 364.41,311.92 334,153.69 386.78,305.92" />
    </svg>
  );
}

export function PiMarkIcon(props: CustomIconProps) {
  return (
    <CustomIcon {...props}>
      <path d="M7 19V7.8A3.8 3.8 0 0 1 10.8 4h2.4A3.8 3.8 0 0 1 17 7.8v2.4a3.8 3.8 0 0 1-3.8 3.8H9" />
      <path d="M17 20v-6" />
      <path d="M6 8h12" />
    </CustomIcon>
  );
}

export function PlanModeIcon(props: CustomIconProps) {
  return (
    <CustomIcon {...props}>
      <path d="M6 5.5h9" />
      <path d="M6 12h6" />
      <path d="M6 18.5h4" />
      <path d="m15 17 2 2 4-5" />
      <path d="M3.5 5.5h.01" />
      <path d="M3.5 12h.01" />
      <path d="M3.5 18.5h.01" />
    </CustomIcon>
  );
}

export function YoloDangerIcon(props: CustomIconProps) {
  return (
    <CustomIcon {...props}>
      <path d="M12 3.5 5.5 6v5.2c0 4.1 2.7 7.8 6.5 9.3 3.8-1.5 6.5-5.2 6.5-9.3V6L12 3.5Z" />
      <path d="m12.7 7-3.2 5h3l-1.2 5 3.2-6h-3l1.2-4Z" />
    </CustomIcon>
  );
}

export function McpNetworkIcon(props: CustomIconProps) {
  return (
    <CustomIcon {...props}>
      <path d="M8 4v5" />
      <path d="M16 4v5" />
      <path d="M6 9h12v3.5a6 6 0 0 1-12 0V9Z" />
      <path d="M12 18.5V21" />
      <path d="M9.5 21h5" />
      <path d="M9 12h6" />
      <path d="M10.5 15h3" />
    </CustomIcon>
  );
}

export function AgentScreenIcon(props: CustomIconProps) {
  return (
    <CustomIcon {...props}>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M8.5 9.5h.01" />
      <path d="M15.5 9.5h.01" />
      <path d="M9.5 13c1.4 1 3.6 1 5 0" />
    </CustomIcon>
  );
}

export function SubagentIcon(props: CustomIconProps) {
  return (
    <CustomIcon {...props}>
      <circle cx="12" cy="12" r="3.5" />
      <circle cx="5" cy="7" r="2" />
      <circle cx="19" cy="7" r="2" />
      <circle cx="12" cy="20" r="2" />
      <path d="m6.7 8.3 2.7 2" />
      <path d="m17.3 8.3-2.7 2" />
      <path d="M12 15.5V18" />
    </CustomIcon>
  );
}
