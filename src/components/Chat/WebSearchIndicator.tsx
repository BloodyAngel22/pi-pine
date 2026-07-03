import { useState } from "react";
import { Globe, X, ChevronDown, ChevronUp } from "@/components/ui/icons/compat";
import { Chip } from "@/components/ui/Chip";
import { useChat } from "@/store/chat";

export function WebSearchIndicator() {
  const status = useChat((s) => s.webSearchStatus);
  const result = useChat((s) => s.webSearchResult);
  const query = useChat((s) => s.webSearchQuery);
  const error = useChat((s) => s.webSearchError);
  const clear = useChat((s) => s.clearWebSearch);
  const [open, setOpen] = useState(false);

  if (status === null && !result && !error) return null;

  const isFetching = status === "fetching";
  const isError = status === "error";
  const details = result?.details;
  const label = isFetching ? "ws…" : isError ? "ws!" : details?.status ? `ws:${details.status}` : "ws";
  const title = isFetching
    ? "Веб-поиск: загрузка..."
    : isError
      ? `Веб-поиск: ${error}`
      : `Веб-поиск: ${details?.url ?? query ?? "готово"}`;

  return (
    <>
      <span className="pi-statusbar-sep">·</span>
      <span className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-full"
          title={title}
        >
          <Chip
            size="xs"
            tone={isError ? "danger" : isFetching || open ? "accent" : "neutral"}
            variant={open ? "mode" : "health"}
            icon={<Globe size={11} className={isFetching ? "animate-pulse" : ""} />}
            mono
            interactive
          >
            {label}
            {(result || isError) && (
              <span className="text-(--color-fg-dim)">
                {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              </span>
            )}
          </Chip>
        </button>
        {open && (result || isError) && (
          <div className="pi-statusbar-popover">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-(--color-fg)">Веб-поиск</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-(--color-fg-dim) hover:text-(--color-fg)"
              >
                <X size={12} />
              </button>
            </div>
            {query && <div className="mb-2 text-[10px] text-(--color-fg-dim)">{query}</div>}
            {isError && <div className="text-xs text-(--color-danger)">{error}</div>}
            {result && (
              <>
                <div className="mb-2 flex flex-wrap gap-1.5 text-[10px] text-(--color-fg-dim)">
                  {details?.mode && <span>{details.mode}</span>}
                  {details?.status != null && <span>HTTP {details.status}</span>}
                  {details?.bytes != null && <span>{details.bytes} bytes</span>}
                  {details?.truncated && <span>truncated</span>}
                  {details?.blocked && <span className="text-(--color-danger)">заблокировано{details.challengeType ? ` (${details.challengeType})` : ""}</span>}
                  {details?.headlessUsed && <span>headless</span>}
                </div>
                {details?.url && <div className="mb-2 truncate font-mono text-[10px] text-(--color-accent)">{details.url}</div>}
                <div className="mb-2 flex gap-1.5">
                  <button
                    type="button"
                    onClick={clear}
                    className="px-2 py-1 rounded bg-(--color-bg-mute) hover:bg-(--color-border) text-[10px]"
                  >
                    Очистить
                  </button>
                </div>
                <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap break-all rounded border border-(--color-border) bg-(--color-bg) p-2 font-mono text-[10px] text-(--color-fg-mute)">
                  {result.text}
                </pre>
              </>
            )}
          </div>
        )}
      </span>
    </>
  );
}
