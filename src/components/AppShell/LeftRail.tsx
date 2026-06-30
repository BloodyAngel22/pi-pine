import { AppIcon } from "@/components/ui/AppIcon";
import { IconRail, RailButton } from "./IconRail";

interface LeftRailProps {
  sessionsOpen: boolean;
  onToggleSessions(): void;
  onNewSession(): void;
  onOpenSearch(): void;
  onOpenSettings(): void;
}

export function LeftRail({ sessionsOpen, onToggleSessions, onNewSession, onOpenSearch, onOpenSettings }: LeftRailProps) {
  return (
    <IconRail side="left">
      <RailButton side="left" icon={<AppIcon name="message" size={17} />} label="Все сессии" active={sessionsOpen} onClick={onToggleSessions} />
      <RailButton side="left" icon={<AppIcon name="plus" size={17} />} label="Новая сессия" onClick={onNewSession} />
      <RailButton side="left" icon={<AppIcon name="search" size={17} />} label="Поиск" onClick={onOpenSearch} />
      <div className="flex-1" />
      <RailButton side="left" icon={<AppIcon name="settings" size={17} />} label="Настройки" onClick={onOpenSettings} />
    </IconRail>
  );
}
