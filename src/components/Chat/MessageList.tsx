import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Sparkles, ArrowDown } from "lucide-react";
import { useChat, type UiMessage } from "@/store/chat";
import { useShallow } from "zustand/react/shallow";
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

/** How close to the bottom (px) counts as "at bottom". */
const AT_BOTTOM_THRESHOLD = 80;

export function MessageList({ onCopy, onFork, onRegenerate, onEdit }: Props) {
  const rawMessages = useChat(useShallow((s) => s.messages));
  const messages = useThrottledValue(rawMessages, 100);
  const agentState = useChat(useShallow((s) => s.agentState));
  const switching = useChat((s) => s.switching);
  const parentRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(messages);
  const [atBottomUI, setAtBottomUI] = useState(true);
  const atBottomRef = useRef(true);
  const [lastSeenIdx, setLastSeenIdx] = useState(0);

  messagesRef.current = messages;

  // ─── Scroll tracking ──────────────────────────────────────────────
  //
  // `atBottomRef.current` is updated synchronously in onScroll, so it is
  // always correct regardless of React batching. `setAtBottomUI` is only
  // for the scroll-to-bottom button visibility.

  const updateAtBottom = useCallback(() => {
    const el = parentRef.current;
    if (!el) return;
    const isEnd =
      el.scrollHeight - el.scrollTop - el.clientHeight <= AT_BOTTOM_THRESHOLD;

    if (atBottomRef.current !== isEnd) {
      atBottomRef.current = isEnd;
      setAtBottomUI(isEnd);
    }

    if (isEnd) {
      setLastSeenIdx(messagesRef.current.length);
    }
  }, []);

  // ─── Native scroll-to-end helpers ─────────────────────────────────

  const scrollContainerToEnd = useCallback(() => {
    const el = parentRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  // ─── Auto-follow on append ────────────────────────────────────────
  //
  // When new messages arrive and user is at the bottom, scroll to end
  // to keep the latest content visible.

  useLayoutEffect(() => {
    if (messages.length > 0 && atBottomRef.current) {
      scrollContainerToEnd();
    }
  }, [messages.length, scrollContainerToEnd]);

  // ─── Force scroll on new-turn ─────────────────────────────────────
  //
  // Optimistic/localEcho user messages and pending assistant placeholders
  // appear before the real pi data arrives. We force-scroll to make them
  // visible immediately.

  const [followKey, setFollowKey] = useState(0);

  useLayoutEffect(() => {
    const last = messages[messages.length - 1];
    if (!last) return;
    const isNewTurn =
      (last.role === "user" && (last.localEcho || last.optimistic)) ||
      (last.role === "assistant" && last.pendingAssistant);
    if (!isNewTurn) return;

    atBottomRef.current = true;
    setAtBottomUI(true);
    setLastSeenIdx(messages.length);
    setFollowKey((k) => k + 1);
  }, [messages]);

  useLayoutEffect(() => {
    if (followKey > 0) {
      scrollContainerToEnd();
    }
  }, [followKey, scrollContainerToEnd]);

  // ─── Initial mount scroll ─────────────────────────────────────────

  const initialScrollDone = useRef(false);
  useLayoutEffect(() => {
    if (!initialScrollDone.current && parentRef.current) {
      initialScrollDone.current = true;
      scrollContainerToEnd();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Wheel handler: prevent `<pre>` from stealing vertical scroll ─
  //
  // Code blocks with `overflow-x: auto` and a visible scrollbar cause
  // the browser to capture vertical wheel events and shift the code
  // horizontally — jitter during chat scroll. We intercept at the
  // container level (capture phase), prevent default, and always
  // redirect vertical movement to the chat container.
  //
  // Users can still scroll code horizontally via Shift+wheel (standard
  // convention, same as VS Code / many editors) or by dragging the
  // horizontal scrollbar.

  useLayoutEffect(() => {
    const el = parentRef.current;
    if (!el) return;

    const handler = (e: WheelEvent) => {
      if (e.shiftKey) return;
      const pre = (e.target as HTMLElement).closest<HTMLPreElement>("pre");
      if (!pre || pre.scrollWidth <= pre.clientWidth) return;

      // If the <pre> has intentional vertical scroll (like file diff
      // previews in ToolCall: max-h + overflow:auto), let it be.
      if (pre.scrollHeight > pre.clientHeight) return;

      // <pre> only has horizontal scroll (inline code in markdown).
      // The browser would convert vertical wheel → horizontal scroll,
      // causing jitter. Prevent that and redirect to chat.
      e.preventDefault();
      el.scrollTop += e.deltaY;
    };

    el.addEventListener("wheel", handler, { passive: false, capture: true });
    return () => el.removeEventListener("wheel", handler, { capture: true } as EventListenerOptions);
  }, []);

  // Reset on messages clear.
  useEffect(() => {
    if (messages.length === 0) {
      atBottomRef.current = true;
      setAtBottomUI(true);
      setLastSeenIdx(0);
      initialScrollDone.current = false;
    }
  }, [messages.length]);

  // ─── Actions ──────────────────────────────────────────────────────

  const scrollToEnd = useCallback(() => {
    atBottomRef.current = true;
    setAtBottomUI(true);
    setLastSeenIdx(messages.length);
    scrollContainerToEnd();
  }, [scrollContainerToEnd, messages.length]);

  const unreadCount = !atBottomUI
    ? Math.max(0, messages.length - lastSeenIdx)
    : 0;

  // ─── Empty / loading states ───────────────────────────────────────

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
            <div className="text-xs text-(--color-fg-dim)">
              {t.chat.empty.tipSlash}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Main render (plain flow, no virtualizer) ─────────────────────
  //
  // All messages are rendered in normal DOM flow. No absolute
  // positioning, no transform, no ResizeObserver, no measurement
  // corrections. The browser handles layout and scrolling natively.
  //
  // This is the same approach used by Telegram Web, Element Web,
  // Zulip, and other production chat UIs. Virtual list libraries
  // cause inherent scroll jitter with dynamic-height messages
  // because item positions shift when above-viewport items get
  // measured for the first time.
  //
  // Message component is wrapped in React.memo to prevent re-renders
  // when unrelated messages update.

  return (
    <div className="flex-1 min-h-0 relative">
      <div
        ref={parentRef}
        className="pi-stream"
        onScroll={updateAtBottom}
        style={{ overflowAnchor: "none", overflowY: "auto", height: "100%" }}
      >
        <div className="pi-stream-content">
          <PlanTodoInline />

          {messages.map((message) => (
            <div key={message.id} style={{ marginBottom: "1.25rem" }}>
              <Message
                message={message}
                onCopy={onCopy}
                onFork={onFork}
                onRegenerate={onRegenerate}
                onEdit={onEdit}
              />
            </div>
          ))}

          {/* Extra space for visual comfort at the bottom. */}
          <div style={{ height: 40 }} aria-hidden="true" />
        </div>
      </div>

      {!atBottomUI && (
        <div className="absolute bottom-6 right-6 z-30 pointer-events-none">
          <button
            type="button"
            onClick={scrollToEnd}
            className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-(--color-accent) text-white shadow-lg hover:brightness-110 transition-all duration-200"
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
