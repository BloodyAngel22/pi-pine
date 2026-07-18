import { useEffect, useRef, useState } from "react";
import { useChat } from "@/store/chat";
import { PiPineLogoMark } from "@/components/ui/icons/custom";

const HIDE_DELAY_MS = 600;

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

function formatSignedTokens(n: number): string {
  const sign = n > 0 ? "+" : "−";
  const abs = Math.abs(n);
  const value =
    abs < 1000 ? String(abs) : abs < 100000 ? `${(abs / 1000).toFixed(1).replace(/\.0$/, "")}k` : `${Math.round(abs / 1000)}k`;
  return `${sign}${value}`;
}

/**
 * Плавающий индикатор "агент работает над текущим запросом целиком" —
 * в отличие от ActivityIndicator внутри сообщений/тулов, не привязан к
 * одному блоку и не пропадает между стримингом/тулами/саб-агентами/
 * retry/компакцией, пока весь ход не завершится.
 */
export function AgentWorkGlyph() {
  const isStreaming = useChat((s) => s.agentState?.isStreaming ?? false);
  const isCompacting = useChat((s) => s.agentState?.isCompacting ?? false);
  const isRetrying = useChat((s) => s.agentState?.isRetrying ?? false);
  const retryActive = useChat((s) => s.retryStatus.active);
  const pendingMessageCount = useChat((s) => s.pendingMessageCount);
  const pendingUserAction = useChat((s) => s.pendingUserAction);
  const hasRunningTool = useChat((s) =>
    s.messages.some((m) =>
      m.blocks.some((b) => b.kind === "tool" && (b.status === "running" || b.status === "pending")),
    ),
  );
  const contextTokens = useChat((s) => s.sessionStats?.contextUsage?.tokens ?? null);

  const isAgentTurnActive =
    isStreaming ||
    isCompacting ||
    isRetrying ||
    retryActive ||
    pendingMessageCount > 0 ||
    Boolean(pendingUserAction) ||
    hasRunningTool;

  const [visible, setVisible] = useState(false);
  const [turnStartedAt, setTurnStartedAt] = useState<number | null>(null);
  const [baselineTokens, setBaselineTokens] = useState<number | null>(null);
  const [elapsedLabel, setElapsedLabel] = useState("0:00");
  const hideTimer = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  useEffect(() => {
    if (isAgentTurnActive) {
      if (hideTimer.current) {
        window.clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      setVisible(true);
      if (turnStartedAt == null) {
        setBaselineTokens(contextTokens);
        setTurnStartedAt(Date.now());
        void useChat.getState().refreshSessionStats();
      }
    } else if (turnStartedAt != null) {
      hideTimer.current = window.setTimeout(() => {
        setVisible(false);
        setTurnStartedAt(null);
        setBaselineTokens(null);
      }, HIDE_DELAY_MS);
    }
    return () => {
      if (hideTimer.current) {
        window.clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
    };
    // Намеренно реагируем только на переход isAgentTurnActive, а не на каждое обновление contextTokens.
  }, [isAgentTurnActive]);

  useEffect(() => {
    if (turnStartedAt == null) return;
    setElapsedLabel(formatClock(Date.now() - turnStartedAt));
    const timer = window.setInterval(() => {
      setElapsedLabel(formatClock(Date.now() - turnStartedAt));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [turnStartedAt]);

  if (!visible || turnStartedAt == null) return null;

  const contextDelta = baselineTokens != null && contextTokens != null ? contextTokens - baselineTokens : null;

  return (
    <div className="pi-turn-widget" role="status" aria-live="polite" title="Агент работает над запросом">
      <span className="pi-turn-glyph" aria-hidden="true">
        <PiPineLogoMark size={20} />
      </span>
      <span className="pi-turn-time">{elapsedLabel}</span>
      {contextDelta != null && contextDelta !== 0 && (
        <span className="pi-turn-ctx">{formatSignedTokens(contextDelta)}</span>
      )}
    </div>
  );
}
