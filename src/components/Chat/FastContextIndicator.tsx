import { useState } from "react";
import { Search, X, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { useChat } from "@/store/chat";

export function FastContextIndicator() {
  const status = useChat((s) => s.fastContextStatus);
  const results = useChat((s) => s.fastContextResults);
  const query = useChat((s) => s.fastContextQuery);
  const error = useChat((s) => s.fastContextError);
  const clear = useChat((s) => s.clearFastContext);
  const [open, setOpen] = useState(false);

  if (status === null && !results && !error) return null;

  const isSearching = status === "searching";
  const isError = status === "error";
  const fileCount = results?.files?.length ?? 0;

  return (
    <>
      <span className="pi-statusbar-sep">·</span>
      <span className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`pi-statusbar-item cursor-pointer ${isSearching ? "text-(--color-accent)" : isError ? "text-(--color-danger)" : "text-(--color-fg-mute)"}`}
          title={isSearching ? "Fast Context: поиск..." : isError ? `Fast Context: ${error}` : `Fast Context: ${fileCount} файлов`}
        >
          <Search size={11} className={isSearching ? "animate-pulse" : ""} />
          <span className="font-mono">
            {isSearching ? "fc…" : isError ? "fc!" : fileCount > 0 ? `fc:${fileCount}` : "fc"}
          </span>
          {(fileCount > 0 || isError) && (
            <span className="text-(--color-fg-dim)">
              {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            </span>
          )}
        </button>
        {open && (fileCount > 0 || isError) && (
          <div className="pi-statusbar-popover">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-(--color-fg)">Fast Context</span>
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
            {results && fileCount > 0 && (
              <div className="mb-2 flex gap-1.5">
                <button
                  type="button"
                  onClick={clear}
                  className="px-2 py-1 rounded bg-(--color-bg-mute) hover:bg-(--color-border) text-[10px]"
                >
                  Очистить
                </button>
              </div>
            )}
            {results && <div className="space-y-1">
              {results.files.map((f) => (
                <div
                  key={f.path}
                  className="flex items-start gap-1.5 text-xs text-(--color-fg-mute) hover:text-(--color-fg)"
                >
                  <FileText size={11} className="mt-0.5 shrink-0 text-(--color-accent)" />
                  <div className="min-w-0">
                    <div className="truncate font-mono">{f.path}</div>
                    {f.ranges && f.ranges.length > 0 && (
                      <div className="text-[10px] text-(--color-fg-dim)">
                        {f.ranges.join(", ")}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>}
          </div>
        )}
      </span>
    </>
  );
}
