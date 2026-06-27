import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Search, X } from "lucide-react";
import { useChat, type UiBlockText, type UiMessage } from "@/store/chat";
import { useShallow } from "zustand/react/shallow";

interface Props {
  open: boolean;
  onClose(): void;
}

function messageText(blocks: import("@/store/chat").UiBlock[]): string {
  return blocks
    .filter((block): block is UiBlockText => block.kind === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function formatDate(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return "";
  return new Date(timestamp).toLocaleString(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const EMPTY_MESSAGES: UiMessage[] = [];

export function PromptSearchPalette({ open, onClose }: Props) {
  const messages = useChat(useShallow((s) => s.tabs.get(s.activeTabId ?? "")?.messages ?? s.messages ?? EMPTY_MESSAGES));
  const injectComposer = useChat((s) => s.injectComposer);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  const prompts = useMemo(
    () =>
      messages
        .filter((message) => message.role === "user")
        .map((message) => ({
          id: message.id,
          text: messageText(message.blocks),
          timestamp: message.timestamp,
        }))
        .filter((item) => item.text.length > 0)
        .reverse(),
    [messages],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return prompts;
    return prompts.filter((item) => item.text.toLowerCase().includes(q));
  }, [prompts, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setHighlight(0);
  }, [open]);

  useEffect(() => {
    setHighlight((current) => Math.min(current, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  if (!open) return null;

  const pick = (text: string) => {
    injectComposer(text);
    onClose();
  };

  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center pb-24">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-[760px] mx-3 bg-(--color-bg-soft) border border-(--color-border) rounded-lg shadow-2xl flex flex-col max-h-[70vh] overflow-hidden">
        <div className="flex items-center gap-2 border-b border-(--color-border) px-2 py-1.5">
          <Search size={13} className="text-(--color-fg-dim)" />
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setHighlight(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onClose();
                return;
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setHighlight((index) => (filtered.length === 0 ? 0 : (index + 1) % filtered.length));
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setHighlight((index) => (filtered.length === 0 ? 0 : index <= 0 ? filtered.length - 1 : index - 1));
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                const item = filtered[highlight];
                if (item) pick(item.text);
              }
            }}
            placeholder="Поиск prompt…"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-(--color-fg-dim)"
          />
          <span className="text-[10px] text-(--color-fg-dim)">
            {filtered.length}/{prompts.length}
          </span>
          <button type="button" onClick={onClose} className="text-(--color-fg-dim) hover:text-(--color-fg)">
            <X size={12} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-xs text-(--color-fg-dim)">Prompts не найдены.</div>
          ) : (
            filtered.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onMouseEnter={() => setHighlight(index)}
                onClick={() => pick(item.text)}
                className={clsx(
                  "w-full text-left px-3 py-2 border-b border-(--color-border)/40",
                  index === highlight ? "bg-(--color-bg-mute)" : "hover:bg-(--color-bg-mute)/60",
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-[10px] text-(--color-accent)">{item.id.slice(0, 8)}</span>
                  <span className="text-[10px] text-(--color-fg-dim)">{formatDate(item.timestamp)}</span>
                </div>
                <div className="text-xs text-(--color-fg-mute) line-clamp-3 whitespace-pre-wrap">{item.text}</div>
              </button>
            ))
          )}
        </div>
        <div className="border-t border-(--color-border) px-2 py-1.5 text-[10px] text-(--color-fg-dim) flex items-center gap-2">
          <span><kbd className="pi-kbd">Enter</kbd> вставить</span>
          <span><kbd className="pi-kbd">Esc</kbd> закрыть</span>
          <span className="ml-auto"><kbd className="pi-kbd">Ctrl+F</kbd> search</span>
        </div>
      </div>
    </div>
  );
}
