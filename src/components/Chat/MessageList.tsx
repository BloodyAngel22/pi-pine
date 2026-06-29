import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Sparkles, ArrowDown } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useChat, type UiMessage } from "@/store/chat";
import { useShallow } from "zustand/react/shallow";
import { useThrottledValue } from "@/lib/useThrottledValue";
import { useChunkedRender } from "@/lib/useChunkedRender";
import { Message } from "./Message";
import { PlanTodoInline } from "./PlanTodoInline";
import { t } from "@/i18n/ru";
import { floatingControlVariants, messageItemVariants, softEase } from "@/lib/motionPresets";

interface Props {
  tabId?: string | null;
  active?: boolean;
  onCopy(text: string): void;
  onFork(message: UiMessage): void;
  onRegenerate(message: UiMessage): void;
  onEdit(message: UiMessage, text: string): void;
}

/** How close to the bottom (px) counts as "at bottom". */
const AT_BOTTOM_THRESHOLD = 80;
const EMPTY_MESSAGES: UiMessage[] = [];

export function MessageList({ tabId, active = true, onCopy, onFork, onRegenerate, onEdit }: Props) {
  const rawMessages = useChat(useShallow((s) => (tabId ? (s.tabs.get(tabId)?.messages ?? EMPTY_MESSAGES) : s.messages)));
  const throttledMessages = useThrottledValue(rawMessages, 100);
  const messages = useDeferredValue(throttledMessages);
  const chunked = useChunkedRender(messages, { active, chunkSize: 40, enabledThreshold: 80 });
  const agentState = useChat(useShallow((s) => (tabId ? (s.tabs.get(tabId)?.agentState ?? null) : s.agentState)));
  const switching = useChat((s) => active && s.switching);
  const parentRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(messages);
  const [atBottomUI, setAtBottomUI] = useState(true);
  const atBottomRef = useRef(true);
  const [lastSeenIdx, setLastSeenIdx] = useState(0);
  const reduceMotion = useReducedMotion();
  const animatedMessageIdsRef = useRef<Set<string>>(new Set());
  const previousMessageCountRef = useRef(messages.length);
  const appendedMessageIdsRef = useRef<Set<string>>(new Set());

  messagesRef.current = messages;

  useEffect(() => {
    const previousCount = previousMessageCountRef.current;
    previousMessageCountRef.current = messages.length;

    if (!active || !chunked.done || messages.length <= previousCount) {
      appendedMessageIdsRef.current = new Set();
      return;
    }

    const appended = messages.slice(previousCount).map((message) => message.id);
    appendedMessageIdsRef.current = new Set(appended);
  }, [active, chunked.done, messages]);

  // ─── Scroll tracking ──────────────────────────────────────────────
  //
  // `atBottomRef.current` is updated synchronously in onScroll, so it is
  // always correct regardless of React batching. `setAtBottomUI` is only
  // for the scroll-to-bottom button visibility.

  const updateAtBottom = useCallback(() => {
    if (!active) return;
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
  }, [active]);

  // ─── Native scroll-to-end helpers ─────────────────────────────────

  const scrollContainerToEnd = useCallback(() => {
    if (!active) return;
    const el = parentRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [active]);

  // ─── Auto-follow on append ────────────────────────────────────────
  //
  // When new messages arrive and user is at the bottom, scroll to end
  // to keep the latest content visible.

  useLayoutEffect(() => {
    if (active && messages.length > 0 && atBottomRef.current) {
      scrollContainerToEnd();
    }
  }, [active, messages.length, scrollContainerToEnd]);

  useLayoutEffect(() => {
    if (active && !chunked.done && atBottomRef.current) {
      scrollContainerToEnd();
    }
  }, [active, chunked.done, chunked.renderedCount, scrollContainerToEnd]);

  // ─── Force scroll on new-turn ─────────────────────────────────────
  //
  // Optimistic/localEcho user messages and pending assistant placeholders
  // appear before the real pi data arrives. We force-scroll to make them
  // visible immediately.

  const [followKey, setFollowKey] = useState(0);

  useLayoutEffect(() => {
    if (!active) return;
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
  }, [active, messages]);

  useLayoutEffect(() => {
    if (active && followKey > 0) {
      scrollContainerToEnd();
    }
  }, [active, followKey, scrollContainerToEnd]);

  // ─── Initial mount scroll ─────────────────────────────────────────

  const initialScrollDone = useRef(false);
  useLayoutEffect(() => {
    if (active && !initialScrollDone.current && parentRef.current) {
      initialScrollDone.current = true;
      scrollContainerToEnd();
    }
  }, [active, scrollContainerToEnd]);

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
    if (!active) return;
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
  }, [active]);

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
  // Message component is wrapped in React.memo to prevent re-renders
  // when unrelated messages update. `.pi-stream-item` uses CSS
  // containment/content-visibility so offscreen messages are cheap.

  return (
    <div className="flex-1 min-h-0 relative">
      <div
        ref={parentRef}
        className="pi-stream"
        onScroll={updateAtBottom}
        style={{ overflowAnchor: "none", overflowY: "auto", height: "100%" }}
      >
        <div className="pi-stream-content">
          <PlanTodoInline tabId={tabId} active={active} />

          {!chunked.done && (
            <div className="pi-stream-chunk-placeholder" aria-hidden="true">
              Загружаем старые сообщения… {chunked.renderedCount}/{chunked.totalCount}
            </div>
          )}

          {chunked.items.map((message) => {
            const shouldAnimate =
              active &&
              chunked.done &&
              appendedMessageIdsRef.current.has(message.id) &&
              !animatedMessageIdsRef.current.has(message.id);

            if (shouldAnimate) {
              animatedMessageIdsRef.current.add(message.id);
            }

            return (
              <motion.div
                key={message.id}
                className="pi-stream-item"
                initial={shouldAnimate ? "hidden" : false}
                animate="visible"
                variants={messageItemVariants(Boolean(reduceMotion))}
                transition={softEase}
              >
                <Message
                  message={message}
                  onCopy={onCopy}
                  onFork={onFork}
                  onRegenerate={onRegenerate}
                  onEdit={onEdit}
                />
              </motion.div>
            );
          })}

          {/* Extra space for visual comfort at the bottom. */}
          <div style={{ height: 40 }} aria-hidden="true" />
        </div>
      </div>

      <AnimatePresence initial={false}>
        {active && !atBottomUI && (
          <motion.div
            key="scroll-to-bottom"
            className="absolute bottom-6 right-6 z-30 pointer-events-none"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={floatingControlVariants(Boolean(reduceMotion))}
            transition={softEase}
          >
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
