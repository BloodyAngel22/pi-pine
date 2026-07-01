import type { ComponentType, SVGProps } from "react";
import {
  IconActivity,
  IconAdjustmentsHorizontal,
  IconAlertCircle,
  IconAlertTriangle,
  IconArrowDown,
  IconArrowsMinimize,
  IconBolt,
  IconBrain,
  IconCamera,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconChevronUp,
  IconCircle,
  IconCircleCheck,
  IconCircleCheckFilled,
  IconClock,
  IconCloud,
  IconColumns2,
  IconCommand,
  IconCopy,
  IconCopyPlus,
  IconCpu,
  IconCurrencyDollar,
  IconDatabase,
  IconDeviceFloppy,
  IconDeviceScreen,
  IconDots,
  IconDownload,
  IconExternalLink,
  IconFileAlert,
  IconFileText,
  IconFolder,
  IconFolderCog,
  IconGauge,
  IconGitBranch,
  IconGitFork,
  IconHash,
  IconHelpCircle,
  IconImageInPicture,
  IconInfoCircle,
  IconKey,
  IconLayersIntersect,
  IconLayoutNavbar,
  IconMenu2,
  IconListCheck,
  IconLoader2,
  IconMessage,
  IconMessageCircle,
  IconMessageQuestion,
  IconNavigation,
  IconPalette,
  IconPaperclip,
  IconPencil,
  IconPhoto,
  IconPin,
  IconPlayerPlay,
  IconPlayerStop,
  IconPlugConnected,
  IconPlus,
  IconPointer,
  IconRefresh,
  IconRobot,
  IconRotate,
  IconRotate2,
  IconRotateClockwise,
  IconSearch,
  IconSend,
  IconServer,
  IconSettings,
  IconSettings2,
  IconShieldBolt,
  IconShieldExclamation,
  IconSlash,
  IconSparkles,
  IconSquare,
  IconStar,
  IconTerminal2,
  IconTool,
  IconTrash,
  IconWand,
  IconWorld,
  IconX,
} from "@tabler/icons-react";
import {
  AgentScreenIcon,
  McpNetworkIcon,
  PiMarkIcon,
  PlanModeIcon,
  SubagentIcon,
  YoloDangerIcon,
  type CustomIconProps,
} from "./icons/custom";

export type AppIconName =
  | "activity"
  | "agentScreen"
  | "alert"
  | "alertTriangle"
  | "arrowDown"
  | "bot"
  | "brain"
  | "camera"
  | "check"
  | "checkCircle"
  | "checkCircleFilled"
  | "chevronDown"
  | "chevronRight"
  | "chevronUp"
  | "circle"
  | "cloud"
  | "columns"
  | "command"
  | "compact"
  | "copy"
  | "copyPlus"
  | "cost"
  | "cpu"
  | "clock"
  | "database"
  | "download"
  | "externalLink"
  | "fileAlert"
  | "fileText"
  | "folder"
  | "folderCog"
  | "gauge"
  | "gitBranch"
  | "gitFork"
  | "hash"
  | "help"
  | "image"
  | "info"
  | "key"
  | "layers"
  | "layoutTop"
  | "menu"
  | "loader"
  | "mcp"
  | "message"
  | "messageCircle"
  | "messageQuestion"
  | "model"
  | "more"
  | "navigation"
  | "palette"
  | "paperclip"
  | "pencil"
  | "photo"
  | "pi"
  | "pin"
  | "plan"
  | "play"
  | "plug"
  | "plus"
  | "pointer"
  | "refresh"
  | "retry"
  | "robot"
  | "rotate"
  | "rotateBack"
  | "save"
  | "screen"
  | "search"
  | "send"
  | "server"
  | "settings"
  | "settings2"
  | "shieldAlert"
  | "shieldBolt"
  | "slash"
  | "sparkles"
  | "square"
  | "star"
  | "stop"
  | "subagent"
  | "terminal"
  | "tool"
  | "trash"
  | "wand"
  | "web"
  | "x"
  | "yolo";

export type AppIconProps = SVGProps<SVGSVGElement> & {
  name: AppIconName;
  size?: number | string;
  strokeWidth?: number | string;
};

type IconComponent = ComponentType<any>;

const iconMap: Record<AppIconName, IconComponent> = {
  activity: IconActivity,
  agentScreen: AgentScreenIcon,
  alert: IconAlertCircle,
  alertTriangle: IconAlertTriangle,
  arrowDown: IconArrowDown,
  bot: IconRobot,
  brain: IconBrain,
  camera: IconCamera,
  check: IconCheck,
  checkCircle: IconCircleCheck,
  checkCircleFilled: IconCircleCheckFilled,
  chevronDown: IconChevronDown,
  chevronRight: IconChevronRight,
  chevronUp: IconChevronUp,
  circle: IconCircle,
  cloud: IconCloud,
  columns: IconColumns2,
  command: IconCommand,
  compact: IconArrowsMinimize,
  copy: IconCopy,
  copyPlus: IconCopyPlus,
  cost: IconCurrencyDollar,
  cpu: IconCpu,
  clock: IconClock,
  database: IconDatabase,
  download: IconDownload,
  externalLink: IconExternalLink,
  fileAlert: IconFileAlert,
  fileText: IconFileText,
  folder: IconFolder,
  folderCog: IconFolderCog,
  gauge: IconGauge,
  gitBranch: IconGitBranch,
  gitFork: IconGitFork,
  hash: IconHash,
  help: IconHelpCircle,
  image: IconImageInPicture,
  info: IconInfoCircle,
  key: IconKey,
  layers: IconLayersIntersect,
  layoutTop: IconLayoutNavbar,
  loader: IconLoader2,
  menu: IconMenu2,
  mcp: McpNetworkIcon,
  message: IconMessage,
  messageCircle: IconMessageCircle,
  messageQuestion: IconMessageQuestion,
  model: IconCpu,
  more: IconDots,
  navigation: IconNavigation,
  palette: IconPalette,
  paperclip: IconPaperclip,
  pencil: IconPencil,
  photo: IconPhoto,
  pi: PiMarkIcon,
  pin: IconPin,
  plan: PlanModeIcon,
  play: IconPlayerPlay,
  plug: IconPlugConnected,
  plus: IconPlus,
  pointer: IconPointer,
  refresh: IconRefresh,
  retry: IconRefresh,
  robot: IconRobot,
  rotate: IconRotateClockwise,
  rotateBack: IconRotate2,
  save: IconDeviceFloppy,
  screen: IconDeviceScreen,
  search: IconSearch,
  send: IconSend,
  server: IconServer,
  settings: IconSettings,
  settings2: IconSettings2,
  shieldAlert: IconShieldExclamation,
  shieldBolt: IconShieldBolt,
  slash: IconSlash,
  sparkles: IconSparkles,
  square: IconSquare,
  star: IconStar,
  stop: IconPlayerStop,
  subagent: SubagentIcon,
  terminal: IconTerminal2,
  tool: IconTool,
  trash: IconTrash,
  wand: IconWand,
  web: IconWorld,
  x: IconX,
  yolo: YoloDangerIcon,
};

export function AppIcon({ name, size = 16, strokeWidth = 1.8, ...props }: AppIconProps) {
  const Icon = iconMap[name];
  return <Icon size={size} strokeWidth={strokeWidth} aria-hidden="true" focusable="false" {...props} />;
}
