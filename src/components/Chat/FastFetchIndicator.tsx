import { useState } from "react";
import { Globe, X, ChevronDown, ChevronUp } from "lucide-react";
import { useChat } from "@/store/chat";

export function FastFetchIndicator() {
  const status = useChat((s) => s.fastFetchStatus);
  const result = useChat((s) => s.fastFetchResult);
  const query = useChat((s) => s.fastFetchQuery);
  const error = useChat((s) => s.fastFetchError);
  const clear = useChat((s) => s.clearFastFetch);
  const [open, setOpen] = useState(false);

  if (status === null && !result && !error) return null;

  const isFetching = status === "fetching";
  const isError = status === "error";
  const details = result?.details;
  const label = isFetching ? "ff…" : isError ? "ff!" : details?.status ? `ff:${details.status}` : "ff";
  const title = isFetching
    ? "Fast Fetch: загрузка..."
    : isError
      ? `Fast Fetch: ${error}`
      : `Fast Fetch: ${details?.url ?? query ?? "готово"}`;

  return (
    <>
      <span className="pi-statusbar-sep">·</span>
      <span className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`pi-statusbar-item cursor-pointer ${isFetching ? "text-(--color-accent)" : isError ? "text-(--color-danger)" : "text-(--color-fg-mute)"}`}
          title={title}
        >
          <Globe size={11} className={isFetching ? "animate-pulse" : ""} />
          <span className="font-mono">{label}</span>
          {(result || isError) && (
            <span className="text-(--color-fg-dim)">
              {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            </span>
          )}
        </button>
        {open && (result || isError) && (
          <div className="pi-statusbar-popover">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-(--color-fg)">Fast Fetch</span>
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
