import { useEffect, useMemo, useState } from "react";
import { Play, RefreshCw, Search, Terminal, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import * as rpc from "@/rpc/bridge";
import { useChat } from "@/store/chat";

function commandText(command: rpc.PiCommand): string {
  return command.name.startsWith("/") ? command.name : `/${command.name}`;
}

function sourceLabel(command: rpc.PiCommand): string {
  return command.source;
}

function commandPath(command: rpc.PiCommand): string | undefined {
  return command.sourceInfo?.path ?? command.path;
}

function commandLocation(command: rpc.PiCommand): string | undefined {
  return command.sourceInfo?.scope ?? command.location ?? command.sourceInfo?.source;
}

export function CommandsTab() {
  const send = useChat((s) => s.send);
  const injectComposer = useChat((s) => s.injectComposer);
  const setError = useChat((s) => s.setError);
  const [commands, setCommands] = useState<rpc.PiCommand[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const res = await rpc.getCommands();
      setCommands(Array.isArray(res.commands) ? res.commands : []);
    } catch (error) {
      setError(String(error));
      setCommands([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((command) =>
      command.name.toLowerCase().includes(q) ||
      (command.description ?? "").toLowerCase().includes(q) ||
      command.source.toLowerCase().includes(q),
    );
  }, [commands, query]);

  const grouped = useMemo(() => {
    const groups = new Map<string, rpc.PiCommand[]>();
    for (const command of filtered) {
      const key = sourceLabel(command);
      groups.set(key, [...(groups.get(key) ?? []), command]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <div className="p-3 space-y-3 text-xs min-w-0">
      <div className="flex items-center gap-1.5">
        <div className="flex items-center gap-1.5 border border-(--color-border) rounded bg-(--color-bg) px-2 py-1 flex-1 min-w-0">
          <Search size={12} className="text-(--color-fg-dim) shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск команд…"
            className="bg-transparent outline-none flex-1 min-w-0 placeholder:text-(--color-fg-dim)"
          />
        </div>
        <Button variant="ghost" size="sm" icon={<RefreshCw size={11} />} onClick={() => void reload()} disabled={loading} />
      </div>

      <div className="flex items-center gap-2 text-(--color-fg-dim)">
        <Terminal size={12} />
        <span>{filtered.length}/{commands.length} commands</span>
      </div>

      {loading && <div className="text-(--color-fg-dim)">Загрузка команд…</div>}
      {!loading && filtered.length === 0 && <div className="text-(--color-fg-dim)">Команды не найдены.</div>}

      <div className="space-y-3">
        {grouped.map(([source, items]) => (
          <div key={source} className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wide text-(--color-fg-dim)">{source}</div>
            {items.map((command) => {
              const text = commandText(command);
              return (
                <div key={`${command.source}:${command.name}`} className="border border-(--color-border) rounded bg-(--color-bg) p-2 space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-(--color-accent)">{text}</div>
                      {command.description && (
                        <div className="text-(--color-fg-dim) line-clamp-2">{command.description}</div>
                      )}
                      {(commandLocation(command) || commandPath(command)) && (
                        <div className="font-mono text-[10px] text-(--color-fg-dim) truncate" title={commandPath(command) ?? commandLocation(command)}>
                          {commandLocation(command) ?? commandPath(command)}
                        </div>
                      )}
                    </div>
                    <span className="font-mono text-[10px] text-(--color-fg-dim)">{command.source}</span>
                  </div>
                  <div className="flex gap-1.5 justify-end">
                    <Button variant="ghost" size="sm" icon={<Plus size={11} />} onClick={() => injectComposer(text)}>
                      Вставить
                    </Button>
                    <Button variant="primary" size="sm" icon={<Play size={11} />} onClick={() => void send(text)}>
                      Запустить
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
