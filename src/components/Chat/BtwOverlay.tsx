import { useEffect, useRef, useState } from "react";
import { HelpCircle, Loader2, Send, X } from "lucide-react";
import clsx from "clsx";
import { askBtw } from "@/rpc/bridge";
import { Markdown } from "./Markdown";

interface Props {
  open: boolean;
  initialQuestion?: string;
  onClose(): void;
}

export function BtwOverlay({ open, initialQuestion, onClose }: Props) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuestion(initialQuestion ?? "");
    setAnswer("");
    setError(null);
    setLoading(false);
    setTimeout(() => textRef.current?.focus(), 0);
  }, [open, initialQuestion]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const submit = async () => {
    const trimmed = question.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setAnswer("");
    setError(null);
    try {
      const result = await askBtw(trimmed);
      setAnswer(result.answer);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 bg-(--color-bg)/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-3xl max-h-[82vh] rounded-2xl border border-(--color-border) bg-(--color-bg-soft) shadow-2xl overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-(--color-border) flex items-center gap-2">
          <HelpCircle size={16} className="text-(--color-accent)" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-(--color-fg)">BTW question</div>
            <div className="text-[11px] text-(--color-fg-dim)">
              Out-of-band ответ по текущему контексту без записи в историю агента.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-(--color-fg-dim) hover:text-(--color-fg) hover:bg-(--color-bg-mute)"
            title="Закрыть"
          >
            <X size={15} />
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto">
          <div className="rounded-xl border border-(--color-border) bg-(--color-bg) overflow-hidden">
            <textarea
              ref={textRef}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault();
                  void submit();
                }
              }}
              rows={4}
              placeholder="Спроси что-то по текущему контексту, не вмешиваясь в работу агента…"
              className="block w-full resize-none bg-transparent outline-none p-3 text-sm text-(--color-fg) placeholder:text-(--color-fg-dim)"
            />
            <div className="px-2.5 py-2 border-t border-(--color-border) flex items-center gap-2">
              <span className="text-[11px] text-(--color-fg-dim)">Ctrl+Enter — спросить</span>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!question.trim() || loading}
                className={clsx(
                  "inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium transition-colors",
                  !question.trim() || loading
                    ? "bg-(--color-bg-mute) text-(--color-fg-dim) cursor-not-allowed"
                    : "bg-(--color-accent) text-(--color-bg) hover:opacity-90",
                )}
              >
                {loading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                Спросить
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-(--color-danger)/30 bg-(--color-danger)/10 px-3 py-2 text-xs text-(--color-danger)">
              {error}
            </div>
          )}

          {(loading || answer) && (
            <div className="rounded-xl border border-(--color-border) bg-(--color-bg) p-3 min-h-20">
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-(--color-fg-mute)">
                  <Loader2 size={14} className="animate-spin text-(--color-accent)" />
                  Думаю над попутным вопросом…
                </div>
              ) : (
                <div className="text-sm text-(--color-fg)">
                  <Markdown text={answer} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
