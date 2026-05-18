import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { Virtuoso, type Components, type VirtuosoHandle } from "react-virtuoso";
import { Sparkles, ArrowDown } from "lucide-react";
import { useChat, type UiMessage } from "@/store/chat";
import { useThrottledValue } from "@/lib/useThrottledValue";
import { Message } from "./Message";
import { PlanTodoInline } from "./PlanTodoInline";
import { t } from "@/i18n/ru";

interface Props {
  onCopy(text: string): void;
  onFork(message: UiMessage): void;
  onRegenerate(message: UiMessage): void;
  onEdit(message: UiMessage, text: string): void;
}

const STREAM_RENDER_THROTTLE_MS = 50;
const VIRTUOSO_OVERSCAN_PX = 900;

const VirtualizedMessageList = forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  (props, ref) => <div {...props} ref={ref} className="pi-stream" />,
);
VirtualizedMessageList.displayName = "VirtualizedMessageList";

const MessageListFooter = () => <div className="h-12" aria-hidden="true" />;

const virtuosoComponents: Components<UiMessage> = {
  Header: PlanTodoInline,
  List: VirtualizedMessageList,
  Footer: MessageListFooter,
};

export function MessageList({ onCopy, onFork, onRegenerate, onEdit }: Props) {
  const rawMessages = useChat((s) => s.messages);
  const messages = useThrottledValue(rawMessages, STREAM_RENDER_THROTTLE_MS);
  const agentState = useChat((s) => s.agentState);
  const switching = useChat((s) => s.switching);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  /** true пока пользователь находится вблизи низа списка */
  const atBottom = useRef(true);
  /** управляет видимостью кнопки «прокрутить вниз» */
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  /** индекс последнего сообщения, которое видел пользователь (когда был внизу) */
  const [lastSeenIndex, setLastSeenIndex] = useState(0);

  const scrollToBottom = useCallback((behavior: "auto" | "smooth" = "smooth") => {
    virtuosoRef.current?.scrollToIndex({ index: "LAST", align: "end", behavior });
  }, []);

  // При очистке сообщений (смена сессии/форк) сбрасываем позицию прокрутки вниз.
  useEffect(() => {
    if (messages.length === 0) {
      atBottom.current = true;
      setShowScrollBtn(false);
      setLastSeenIndex(0);
    }
  }, [messages.length]);

  const handleAtBottomChange = useCallback(
    (bottom: boolean) => {
      atBottom.current = bottom;
      setShowScrollBtn(!bottom);
      if (bottom) {
        setLastSeenIndex(messages.length);
      }
    },
    [messages.length],
  );

  const followOutput = useCallback((isAtBottom: boolean) => {
    if (!isAtBottom && !atBottom.current) {
      setShowScrollBtn(true);
      return false;
    }
    atBottom.current = true;
    setShowScrollBtn(false);
    setLastSeenIndex(messages.length);
    return "auto" as const;
  }, [messages.length]);

  const unreadCount = showScrollBtn ? Math.max(0, messages.length - lastSeenIndex) : 0;

  if (messages.length === 0) {
    if (switching) {
      return (
        <div className="flex-1 overflow-hidden">
          <div className="h-full flex items-center justify-center p-8">
            <div className="flex items-center gap-2 text-sm text-(--color-fg-mute)">
              <span className="w-2 h-2 rounded-full bg-(--color-accent) animate-pulse" />
              Переключаем сессию…
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="flex-1 overflow-hidden">
        <div className="h-full flex items-center justify-center p-8">
          <div className="max-w-md text-center space-y-3">
            <Sparkles size={32} className="mx-auto text-(--color-accent)" />
            <h2 className="text-base font-semibold">{t.chat.empty.title}</h2>
            <p className="text-sm text-(--color-fg-mute)">{t.chat.empty.hint}</p>
            {agentState?.model && (
              <div className="text-xs text-(--color-fg-dim)">
                {t.chat.empty.tipModel}:{" "}
                <span className="font-mono text-(--color-fg-mute)">
                  {agentState.model.provider}/{agentState.model.id}
                </span>
              </div>
            )}
            <div className="text-xs text-(--color-fg-dim)">{t.chat.empty.tipSlash}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 relative">
      <Virtuoso
        ref={virtuosoRef}
        className="h-full"
        data={messages}
        computeItemKey={(_, message) => message.id}
        followOutput={followOutput}
        atBottomStateChange={handleAtBottomChange}
        increaseViewportBy={{ top: VIRTUOSO_OVERSCAN_PX, bottom: VIRTUOSO_OVERSCAN_PX }}
        atBottomThreshold={120}
        components={virtuosoComponents}
        itemContent={(_, message) => (
          <Message
            message={message}
            onCopy={onCopy}
            onFork={onFork}
            onRegenerate={onRegenerate}
            onEdit={onEdit}
          />
        )}
      />
      {showScrollBtn && (
        <div className="absolute bottom-6 right-6 z-30 pointer-events-none">
          <button
            type="button"
            onClick={() => {
              atBottom.current = true;
              setShowScrollBtn(false);
              setLastSeenIndex(messages.length);
              scrollToBottom();
            }}
            className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-(--color-accent) text-white shadow-lg hover:bg-(--color-accent) hover:brightness-110 transition-all duration-200 animate-in fade-in slide-in-from-bottom-2"
            title="Прокрутить вниз"
          >
            <ArrowDown size={12} />
            <span>Вниз</span>
            {unreadCount > 0 && (
              <span className="ml-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-white/20 text-[10px] font-bold">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
