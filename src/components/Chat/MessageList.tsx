import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles, ArrowDown } from "lucide-react";
import { useChat, type UiMessage } from "@/store/chat";
import { Message } from "./Message";
import { t } from "@/i18n/ru";

interface Props {
  onCopy(text: string): void;
  onFork(message: UiMessage): void;
  onRegenerate(message: UiMessage): void;
  onEdit(message: UiMessage, text: string): void;
}

/** Порог в пикселях от низа, при котором считаем пользователя «внизу». */
const SCROLL_THRESHOLD = 120;

function isNearBottom(el: HTMLDivElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= SCROLL_THRESHOLD;
}

export function MessageList({ onCopy, onFork, onRegenerate, onEdit }: Props) {
  const messages = useChat((s) => s.messages);
  const agentState = useChat((s) => s.agentState);
  const switching = useChat((s) => s.switching);
  const ref = useRef<HTMLDivElement>(null);
  /** true пока пользователь находится вблизи низа списка */
  const atBottom = useRef(true);
  /** управляет видимостью кнопки «прокрутить вниз» */
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const scrollToBottom = useCallback((instant?: boolean) => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: instant ? "instant" : "smooth" });
  }, []);

  // При смене сессии/форке всегда прокручиваем вниз
  useEffect(() => {
    if (switching) {
      atBottom.current = true;
      setShowScrollBtn(false);
    }
  }, [switching]);

  // Умный авто-скролл: прокручиваем только если пользователь уже был внизу
  useEffect(() => {
    if (!atBottom.current) return;
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  const handleScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const near = isNearBottom(el);
    atBottom.current = near;
    setShowScrollBtn(!near);
  }, []);

  if (messages.length === 0) {
    return (
      <div className="flex-1 overflow-hidden">
        <div className="h-full flex items-center justify-center p-8">
          {switching ? (
            <div className="text-center space-y-3">
              <div className="inline-flex items-center gap-2 text-sm text-(--color-fg-mute)">
                <span className="w-2.5 h-2.5 rounded-full bg-(--color-accent) animate-pulse" />
                Загружаем сессию…
              </div>
              <div className="text-[11px] text-(--color-fg-dim) max-w-[360px]">
                pi переподключает MCP-сервера. Обычно занимает ~10 сек.
              </div>
            </div>
          ) : (
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
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="flex-1 overflow-y-auto relative" onScroll={handleScroll}>
      {switching && (
        <div className="absolute top-2 right-3 z-10 inline-flex items-center gap-1.5 text-[11px] text-(--color-fg-mute) bg-(--color-bg-soft)/90 border border-(--color-border) px-2 py-1 rounded-md backdrop-blur">
          <span className="w-2 h-2 rounded-full bg-(--color-accent) animate-pulse" />
          Переключаем… MCP ~10 сек
        </div>
      )}
      <div className="pi-stream">
        {messages.map((m) => (
          <Message
            key={m.id}
            message={m}
            onCopy={onCopy}
            onFork={onFork}
            onRegenerate={onRegenerate}
            onEdit={onEdit}
          />
        ))}
      </div>
      {showScrollBtn && (
        <button
          type="button"
          onClick={() => {
            atBottom.current = true;
            setShowScrollBtn(false);
            scrollToBottom();
          }}
          className="absolute bottom-4 right-4 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-(--color-bg-soft) border border-(--color-border) text-(--color-fg-mute) hover:text-(--color-fg) hover:border-(--color-accent)/50 shadow-md transition-colors"
          title="Прокрутить вниз"
        >
          <ArrowDown size={12} />
          Вниз
        </button>
      )}
    </div>
  );
}
