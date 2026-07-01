import { useChat } from "@/store/chat";
import { useExt } from "@/store/ext";
import { useVirtualDisplay } from "@/store/virtualDisplay";
import { shortenPath } from "@/utils/path";
import { AppIcon } from "@/components/ui/AppIcon";
import { Chip } from "@/components/ui/Chip";
import { ExtensionsPill } from "./ExtensionsPill";
import { FastFetchIndicator } from "./FastFetchIndicator";
import { ContextIndicator } from "./ContextIndicator";
import { t } from "@/i18n/ru";

/** Форматирует число токенов как 137k, 12.5k, 980 */
function fmtTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 100000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return Math.round(n / 1000) + "k";
}

export function StatusBar() {
  const cwd = useChat((s) => s.cwd);
  const home = useChat((s) => s.home);
  const agent = useChat((s) => s.agentState);
  const stats = useChat((s) => s.sessionStats);
  const retryStatus = useChat((s) => s.retryStatus);
  const attachedSkills = useChat((s) => s.attachedSkills);
  const statuses = useExt((s) => s.statuses);
  const yoloMode = useExt((s) => s.yoloMode);

  const extEntries: [string, string][] = Object.entries(statuses).filter(
    ([k]) => k !== "cwd" && k !== "context",
  );

  const cwdShort = shortenPath(cwd, home);
  const totalTokens = stats?.tokens?.total ?? 0;
  const vdRunning = useVirtualDisplay((s) => s.status?.running ?? false);
  const vdVisible = useVirtualDisplay((s) => s.visible);

  return (
    <div className="pi-statusbar">
      <div className="pi-statusbar-scroll">
        {/* === LEFT: контекст работы (cwd / model / thinking) === */}
        <Chip size="xs" icon={<AppIcon name="folder" size={11} />} mono title={cwd}>
          <span className="truncate max-w-[260px]">{cwdShort}</span>
        </Chip>
        {/* === MIDDLE: метрики сессии === */}
        {totalTokens > 0 && (
          <>
            <span className="pi-statusbar-sep">·</span>
            <Chip
              size="xs"
              icon={<AppIcon name="gauge" size={11} />}
              mono
              title={`tokens in/out/total: ${stats?.tokens?.input ?? 0}/${stats?.tokens?.output ?? 0}/${totalTokens}`}
            >
              {fmtTokens(totalTokens)}
            </Chip>
          </>
        )}
        {stats && stats.totalMessages != null && stats.totalMessages > 0 && (
          <>
            <span className="pi-statusbar-sep">·</span>
            <Chip size="xs" icon={<AppIcon name="hash" size={11} />} mono title="Сообщений в сессии">
              {stats.totalMessages}
            </Chip>
          </>
        )}
        {stats && stats.cost != null && stats.cost > 0 && (
          <>
            <span className="pi-statusbar-sep">·</span>
            <Chip
              size="xs"
              icon={<AppIcon name="cost" size={11} />}
              mono
              title={`Стоимость сессии: $${stats.cost.toFixed(4)}`}
            >
              {stats.cost.toFixed(2)}
            </Chip>
          </>
        )}
        <FastFetchIndicator />
        {attachedSkills.length > 0 && (
          <>
            <span className="pi-statusbar-sep">·</span>
            <Chip size="xs" tone="accent" icon={<AppIcon name="pin" size={11} />} title={`Закреплённые скиллы: ${attachedSkills.join(", ")}`}>
              {attachedSkills.length}
            </Chip>
          </>
        )}
      </div>

      {/* === RIGHT: транзитные индикаторы + ext-пилюля.
            Отдельная зона без overflow — иначе absolute popover клипуется. */}
      <div className="pi-statusbar-end">
        {yoloMode && (
          <Chip
            size="xs"
            tone="danger"
            variant="mode"
            icon={<AppIcon name="yolo" size={11} />}
            title="YOLO permissions / Auto-approve включены: разрешения подтверждаются автоматически"
          >
            YOLO
          </Chip>
        )}
        <ContextIndicator />
        {agent?.isCompacting && (
          <Chip
            size="xs"
            tone="warning"
            variant="health"
            icon={<AppIcon name="compact" size={11} />}
            title={t.chat.compacting}
          >
            {t.chat.compacting}
          </Chip>
        )}
        {(agent?.isRetrying || retryStatus.active) && (
          <Chip
            size="xs"
            tone="accent"
            variant="health"
            icon={<AppIcon name="retry" size={11} />}
            title={retryStatus.errorMessage ?? "auto retry"}
          >
            retry {retryStatus.attempt || agent?.retryAttempt || 0}
          </Chip>
        )}
        {extEntries.length > 0 && <ExtensionsPill items={extEntries} />}
        <span className="pi-statusbar-sep">·</span>
        <button
          type="button"
          className={
            "pi-statusbar-item cursor-pointer " +
            (vdVisible || vdRunning ? "text-(--color-accent)" : "")
          }
          onClick={() => useVirtualDisplay.getState().toggleVisible()}
          title="Экран агента"
        >
          <AppIcon name="agentScreen" size={11} />
          <span>Экран</span>
        </button>
      </div>
    </div>
  );
}
