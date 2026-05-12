import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Columns2, Plus, Square, Terminal as TerminalIcon, X } from "lucide-react";
import clsx from "clsx";
import { useChat } from "@/store/chat";
import { killTerminal, listTerminals, onTerminalExit, spawnTerminal, type TerminalInfo } from "@/terminal";
import { TerminalView } from "./TerminalView";

interface Props {
  open: boolean;
  onClose(): void;
}

export function TerminalPanel({ open, onClose }: Props) {
  const cwd = useChat((s) => s.cwd);
  const [terminals, setTerminals] = useState<TerminalInfo[]>([]);
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [secondaryId, setSecondaryId] = useState<string | null>(null);
  const [split, setSplit] = useState(false);
  const [exited, setExited] = useState<Record<string, number | null>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listTerminals().then((items) => {
      setTerminals(items);
      if (!primaryId && items[0]) setPrimaryId(items[0].id);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    onTerminalExit((event) => {
      setExited((prev) => ({ ...prev, [event.id]: event.exitCode ?? null }));
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    if (!open || terminals.length > 0 || busy) return;
    void createTerminal();
  }, [open, terminals.length, busy]);

  const primary = useMemo(
    () => terminals.find((terminal) => terminal.id === primaryId) ?? terminals[0] ?? null,
    [primaryId, terminals],
  );
  const secondary = useMemo(
    () => terminals.find((terminal) => terminal.id === secondaryId) ?? null,
    [secondaryId, terminals],
  );

  const createTerminal = async (asSecondary = false) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const terminal = await spawnTerminal({
        cwd,
        name: asSecondary && primary ? `${primary.name} split` : `Session ${terminals.filter((terminal) => terminal.id !== secondaryId).length + 1}`,
        cols: 100,
        rows: 24,
      });
      setTerminals((items) => [...items, terminal]);
      setExited((prev) => {
        const next = { ...prev };
        delete next[terminal.id];
        return next;
      });
      if (asSecondary) {
        setSecondaryId(terminal.id);
        setSplit(true);
      } else {
        setPrimaryId(terminal.id);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const closeTerminal = async (id: string) => {
    await killTerminal(id).catch(() => undefined);
    if (secondaryId && id !== secondaryId) {
      await killTerminal(secondaryId).catch(() => undefined);
    }
    setTerminals((items) => items.filter((terminal) => terminal.id !== id && terminal.id !== secondaryId));
    setExited((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setPrimaryId((current) => {
      if (current !== id) return current;
      return terminals.find((terminal) => terminal.id !== id && terminal.id !== secondaryId)?.id ?? null;
    });
    setSecondaryId((current) => (current === id || id === primaryId ? null : current));
  };

  const toggleSplit = () => {
    if (split) {
      if (secondaryId) {
        void killTerminal(secondaryId).catch(() => undefined);
        setTerminals((items) => items.filter((terminal) => terminal.id !== secondaryId));
        setSecondaryId(null);
      }
      setSplit(false);
      return;
    }
    void createTerminal(true);
  };

  return (
    <section className={open ? "flex-1 min-h-0 bg-(--color-bg) flex flex-col" : "hidden"}>
      <div className="h-9 shrink-0 flex items-center gap-1 border-b border-(--color-border) bg-(--color-bg-soft) px-2">
        <div className="flex items-center gap-1 text-xs text-(--color-fg-mute) mr-1">
          <TerminalIcon size={13} />
          <span className="font-medium">Terminal</span>
        </div>
        <div className="text-[10px] uppercase tracking-wide text-(--color-fg-dim) ml-1">
          Sessions
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto pi-terminal-sessions">
          {terminals.filter((terminal) => terminal.id !== secondaryId).map((terminal) => {
            const active = terminal.id === primary?.id;
            const exitCode = exited[terminal.id];
            return (
              <button
                key={terminal.id}
                type="button"
                onClick={() => setPrimaryId(terminal.id)}
                className={clsx(
                  "group h-7 max-w-[180px] inline-flex items-center gap-1.5 px-2 rounded-md border text-xs shrink-0 transition-colors",
                  active
                    ? "bg-(--color-bg) border-(--color-border) text-(--color-fg)"
                    : "border-transparent text-(--color-fg-mute) hover:bg-(--color-bg-mute) hover:text-(--color-fg)",
                )}
                title={`${terminal.name} · ${terminal.cwd}`}
              >
                <span className={clsx("h-1.5 w-1.5 rounded-full", exitCode === undefined ? "bg-(--color-success)" : "bg-(--color-fg-dim)")} />
                <span className="truncate">{terminal.name}</span>
                {exitCode !== undefined && <span className="font-mono text-[10px] text-(--color-fg-dim)">{exitCode ?? "exit"}</span>}
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    void closeTerminal(terminal.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      void closeTerminal(terminal.id);
                    }
                  }}
                  className="opacity-0 group-hover:opacity-100 text-(--color-fg-dim) hover:text-(--color-fg)"
                >
                  <X size={11} />
                </span>
              </button>
            );
          })}
        </div>
        {error && <span className="text-xs text-(--color-danger) max-w-[320px] truncate">{error}</span>}
        <button
          type="button"
          onClick={() => void createTerminal()}
          disabled={busy}
          className="h-7 px-2 inline-flex items-center gap-1 rounded-md text-xs text-(--color-fg-mute) hover:bg-(--color-bg-mute) hover:text-(--color-fg) disabled:opacity-50"
          title="Новая терминальная сессия"
        >
          <Plus size={14} />
          <span>New session</span>
        </button>
        <button
          type="button"
          onClick={toggleSplit}
          className={clsx(
            "h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-(--color-bg-mute)",
            split ? "text-(--color-accent)" : "text-(--color-fg-mute) hover:text-(--color-fg)",
          )}
          title={split ? "Убрать split" : "Разделить терминал"}
        >
          <Columns2 size={14} />
        </button>
        {primary && (
          <button
            type="button"
            onClick={() => void closeTerminal(primary.id)}
            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-(--color-fg-mute) hover:bg-(--color-danger)/10 hover:text-(--color-danger)"
            title="Остановить активный терминал"
          >
            <Square size={12} />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-(--color-fg-mute) hover:bg-(--color-bg-mute) hover:text-(--color-fg)"
          title="Свернуть терминал"
        >
          <ChevronDown size={15} />
        </button>
      </div>
      <div className="flex-1 min-h-0 flex bg-black">
        {terminals.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-xs text-(--color-fg-mute)">
            {busy ? "Запускаю терминал…" : "Нет терминалов"}
          </div>
        ) : (
          <div className="relative flex-1 min-w-0 min-h-0">
            {terminals
              .filter((terminal) => !split || terminal.id !== secondary?.id)
              .map((terminal) => (
              <TerminalView
                key={terminal.id}
                id={terminal.id}
                active={terminal.id === primary?.id && terminal.id !== secondary?.id}
              />
            ))}
          </div>
        )}
        {split && secondary && (
          <div className="relative flex-1 min-w-0 min-h-0 border-l border-(--color-border)">
            <TerminalView id={secondary.id} active />
          </div>
        )}
      </div>
    </section>
  );
}
