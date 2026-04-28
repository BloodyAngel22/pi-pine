import { useExt } from "@/store/ext";
import { useChat } from "@/store/chat";

export function StatusTab() {
  const statuses = useExt((s) => s.statuses);
  const widgets = useExt((s) => s.widgets);
  const stats = useChat((s) => s.sessionStats);
  const stderr = useChat((s) => s.stderrBuffer);

  // Скрываем `cwd` от extension cwd.ts — мы уже показываем его в StatusBar.
  const statusEntries = Object.entries(statuses).filter(([k]) => k !== "cwd");
  const widgetEntries = Object.entries(widgets);

  return (
    <div className="p-3 space-y-4 text-xs">
      <Section title="Статусы расширений">
        {statusEntries.length === 0 ? (
          <Empty />
        ) : (
          <div className="space-y-1">
            {statusEntries.map(([k, v]) => (
              <div key={k} className="flex items-baseline gap-2">
                <span className="text-(--color-fg-dim) font-mono w-16 truncate" title={k}>
                  {k}
                </span>
                <span className="flex-1 truncate" title={v}>
                  {v}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Виджеты">
        {widgetEntries.length === 0 ? (
          <Empty />
        ) : (
          <div className="space-y-2">
            {widgetEntries.map(([k, lines]) => (
              <div key={k} className="border border-(--color-border) rounded p-2">
                <div className="text-(--color-fg-dim) text-[10px] uppercase mb-1">{k}</div>
                {lines.map((l, i) => (
                  <div key={i} className="font-mono whitespace-pre-wrap">
                    {l}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </Section>

      {stats && (
        <Section title="Сессия">
          <Pair k="сообщ." v={stats.totalMessages} />
          <Pair k="user/assistant" v={`${stats.userMessages ?? 0}/${stats.assistantMessages ?? 0}`} />
          <Pair k="tool calls" v={stats.toolCalls} />
          <Pair k="вход" v={stats.tokens?.input} />
          <Pair k="выход" v={stats.tokens?.output} />
          <Pair k="cache R/W" v={`${stats.tokens?.cacheRead ?? 0}/${stats.tokens?.cacheWrite ?? 0}`} />
          <Pair k="$" v={stats.cost ? stats.cost.toFixed(4) : undefined} />
        </Section>
      )}

      {stderr.length > 0 && (
        <Section title="stderr (последние)">
          <div className="font-mono text-[10px] text-(--color-fg-dim) max-h-40 overflow-y-auto space-y-0.5">
            {stderr.slice(-30).map((l, i) => (
              <div key={i} className="whitespace-pre-wrap break-all">
                {l}
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider font-semibold text-(--color-fg-mute) mb-1.5">
        {title}
      </div>
      {children}
    </div>
  );
}
function Empty() {
  return <div className="text-(--color-fg-dim)">пусто</div>;
}
function Pair({ k, v }: { k: string; v: unknown }) {
  if (v == null || v === "") return null;
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-(--color-fg-dim) w-16">{k}</span>
      <span className="font-mono">{String(v)}</span>
    </div>
  );
}
