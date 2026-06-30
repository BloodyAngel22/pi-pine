import { useEffect, useRef, useState } from "react";
import { Terminal, X, Play } from "@/components/ui/icons/compat";
import { Button } from "@/components/ui/Button";
import { useChat } from "@/store/chat";

export function BashPanel({ onClose }: { onClose: () => void }) {
  const runBash = useChat((s) => s.runBash);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [hIdx, setHIdx] = useState(-1);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const submit = async () => {
    if (!value.trim() || busy) return;
    setBusy(true);
    try {
      await runBash(value);
      setHistory((h) => [...h, value].slice(-30));
      setHIdx(-1);
      setValue("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-(--color-border) bg-(--color-bg-soft) px-3 py-2">
      <div className="flex items-center gap-2 text-xs text-(--color-fg-mute) mb-1.5">
        <Terminal size={12} />
        <span className="flex-1">
          Bash в pi (вывод попадёт в LLM-контекст следующего prompt-а)
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-(--color-fg-dim) hover:text-(--color-fg)"
        >
          <X size={12} />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-(--color-accent)">$</span>
        <input
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            } else if (e.key === "Escape") {
              onClose();
            } else if (e.key === "ArrowUp" && history.length) {
              e.preventDefault();
              const next = hIdx < 0 ? history.length - 1 : Math.max(0, hIdx - 1);
              setHIdx(next);
              setValue(history[next] ?? "");
            } else if (e.key === "ArrowDown" && hIdx >= 0) {
              e.preventDefault();
              const next = hIdx + 1;
              if (next >= history.length) {
                setHIdx(-1);
                setValue("");
              } else {
                setHIdx(next);
                setValue(history[next] ?? "");
              }
            }
          }}
          placeholder="ls -la"
          disabled={busy}
          className="flex-1 bg-(--color-bg) border border-(--color-border) rounded px-2 py-1 text-sm font-mono outline-none focus:border-(--color-accent)/50"
        />
        <Button
          size="sm"
          variant="primary"
          onClick={() => void submit()}
          disabled={!value.trim() || busy}
          icon={<Play size={12} />}
        >
          Выполнить
        </Button>
      </div>
    </div>
  );
}
