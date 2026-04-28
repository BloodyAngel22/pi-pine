import { Folder, Cpu, Brain, Hash, DollarSign, Gauge } from "lucide-react";
import { useChat } from "@/store/chat";
import { useExt } from "@/store/ext";
import { shortenPath } from "@/utils/path";
import { ExtensionsPill } from "./ExtensionsPill";

/** Форматирует число токенов как 137k, 12.5k, 980 */
function fmtTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 100000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return Math.round(n / 1000) + "k";
}

export function StatusBar() {
  const cwd = useChat((s) => s.cwd);
  const home = useChat((s) => s.home);
  const agent = useChat((s) => s.agentState);
  const stats = useChat((s) => s.sessionStats);
  const isStreaming = agent?.isStreaming;
  const switching = useChat((s) => s.switching);
  const statuses = useExt((s) => s.statuses);

  // Раскладываем ext-статусы по двум корзинам:
  // - context → отдельный inline-элемент (его смотрят чаще всего)
  // - всё остальное → в пилюлю с popover
  // Также скрываем:
  // - cwd (extension cwd.ts — свой показ)
  // - mcp во время switching — pi эмитит шумные промежуточные статусы
  const contextStatus = statuses["context"];
  const extEntries: [string, string][] = Object.entries(statuses).filter(
    ([k]) => {
      if (k === "cwd" || k === "context") return false;
      if (switching && k === "mcp") return false;
      return true;
    },
  );

  const cwdShort = shortenPath(cwd, home);
  const totalTokens = stats?.tokens?.total ?? 0;

  return (
    <div className="pi-statusbar">
      <div className="pi-statusbar-scroll">
      {/* === LEFT: контекст работы (cwd / model / thinking) === */}
      <span className="pi-statusbar-item" title={cwd}>
        <Folder size={11} className="text-(--color-fg-dim)" />
        <span className="font-mono truncate max-w-[260px]">{cwdShort}</span>
      </span>
      {agent?.model && (
        <>
          <span className="pi-statusbar-sep">·</span>
          <span
            className="pi-statusbar-item"
            title={`${agent.model.provider}/${agent.model.id}`}
          >
            <Cpu size={11} className="text-(--color-fg-dim)" />
            <span className="font-mono truncate max-w-[220px]">
              {agent.model.id}
            </span>
          </span>
        </>
      )}
      {agent?.thinkingLevel && agent.thinkingLevel !== "off" && (
        <>
          <span className="pi-statusbar-sep">·</span>
          <span
            className="pi-statusbar-item"
            title={`thinking: ${agent.thinkingLevel}`}
          >
            <Brain size={11} className="text-(--color-fg-dim)" />
            <span>{agent.thinkingLevel}</span>
          </span>
        </>
      )}

      {/* === MIDDLE: метрики сессии === */}
      {totalTokens > 0 && (
        <>
          <span className="pi-statusbar-sep">·</span>
          <span
            className="pi-statusbar-item"
            title={`tokens in/out/total: ${stats?.tokens?.input ?? 0}/${stats?.tokens?.output ?? 0}/${totalTokens}`}
          >
            <Gauge size={11} className="text-(--color-fg-dim)" />
            <span className="font-mono">{fmtTokens(totalTokens)}</span>
          </span>
        </>
      )}
      {stats && stats.totalMessages != null && stats.totalMessages > 0 && (
        <>
          <span className="pi-statusbar-sep">·</span>
          <span className="pi-statusbar-item" title="Сообщений в сессии">
            <Hash size={11} className="text-(--color-fg-dim)" />
            <span className="font-mono">{stats.totalMessages}</span>
          </span>
        </>
      )}
      {stats && stats.cost != null && stats.cost > 0 && (
        <>
          <span className="pi-statusbar-sep">·</span>
          <span
            className="pi-statusbar-item"
            title={`Стоимость сессии: $${stats.cost.toFixed(4)}`}
          >
            <DollarSign size={11} className="text-(--color-fg-dim)" />
            <span className="font-mono">{stats.cost.toFixed(2)}</span>
          </span>
        </>
      )}
      {contextStatus && (
        <>
          <span className="pi-statusbar-sep">·</span>
          <span
            className="pi-statusbar-context"
            title={`context fill: ${contextStatus}`}
          >
            <span className="text-(--color-fg-dim)">ctx</span>
            <span className="font-mono">{contextStatus}</span>
          </span>
        </>
      )}

      </div>

      {/* === RIGHT: транзитные индикаторы + ext-пилюля.
            Отдельная зона без overflow — иначе absolute popover клипуется. */}
      <div className="pi-statusbar-end">
        {isStreaming && (
          <span className="pi-statusbar-item text-(--color-accent)">
            ● стрим
          </span>
        )}
        {switching && (
          <span className="pi-statusbar-item text-(--color-warn)">
            ◌ переключение сессии
          </span>
        )}
        {extEntries.length > 0 && <ExtensionsPill items={extEntries} />}
      </div>
    </div>
  );
}
