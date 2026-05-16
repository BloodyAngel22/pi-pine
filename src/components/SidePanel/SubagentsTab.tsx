import { Bot, CheckCircle2, Circle, AlertCircle, Wrench } from "lucide-react";
import { useChat, type UiBlockTool } from "@/store/chat";
import { useExt } from "@/store/ext";

interface TaskInfo {
  id: string;
  status: UiBlockTool["status"];
  description: string;
  agent?: string;
  output?: unknown;
  inputTokens?: number;
  outputTokens?: number;
  savedTokens?: number;
  cwd?: string;
  activities: string[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function toTaskInfo(block: UiBlockTool): TaskInfo {
  const input = asRecord(block.input);
  const details = asRecord(block.details);
  return {
    id: block.toolUseId,
    status: block.status,
    description: String(details.description ?? input.description ?? "Sub-agent task"),
    agent: typeof input.agent === "string" ? input.agent : undefined,
    output: block.output,
    inputTokens: typeof details.inputTokens === "number" ? details.inputTokens : undefined,
    outputTokens: typeof details.outputTokens === "number" ? details.outputTokens : undefined,
    savedTokens: typeof details.savedTokens === "number" ? details.savedTokens : undefined,
    cwd: typeof details.cwd === "string" ? details.cwd : undefined,
    activities: toStringList(details.activities ?? details.recentActivities),
  };
}

function formatNumber(value?: number): string {
  return value == null ? "—" : value.toLocaleString();
}

export function SubagentsTab() {
  const status = useExt((s) => s.statuses.subagent);
  const messages = useChat((s) => s.messages);
  const tasks = messages
    .flatMap((message) => message.blocks.filter((block): block is UiBlockTool => block.kind === "tool" && block.name === "task"))
    .map(toTaskInfo)
    .reverse();
  const totalSaved = tasks.reduce((sum, task) => sum + (task.savedTokens ?? 0), 0);
  const running = tasks.filter((task) => task.status === "running").length;

  return (
    <div className="p-3 space-y-3 text-xs min-w-0">
      <div className="border border-(--color-border) rounded-lg bg-(--color-bg) p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Bot size={14} className="text-(--color-accent)" />
          <div className="font-medium text-(--color-fg)">Sub-agents</div>
          <div className="ml-auto font-mono text-(--color-fg-dim)">{tasks.length}</div>
        </div>
        {status ? (
          <div className="text-(--color-fg-mute) whitespace-pre-wrap">{status}</div>
        ) : (
          <div className="text-(--color-fg-dim)">Нет активных sub-agent задач.</div>
        )}
        <div className="grid grid-cols-2 gap-1">
          <Metric label="running" value={running} />
          <Metric label="saved" value={totalSaved} accent />
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="text-(--color-fg-dim)">История task tool calls пока пуста.</div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <div key={task.id} className="border border-(--color-border) rounded bg-(--color-bg) p-2 space-y-2">
              <div className="flex items-start gap-2">
                {task.status === "error" ? (
                  <AlertCircle size={14} className="mt-0.5 text-(--color-danger) shrink-0" />
                ) : task.status === "done" ? (
                  <CheckCircle2 size={14} className="mt-0.5 text-(--color-success) shrink-0" />
                ) : (
                  <Circle size={14} className="mt-0.5 text-(--color-accent) shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="font-mono text-[10px] text-(--color-fg-dim)">{task.status}</span>
                    {task.agent && <span className="font-mono text-[10px] text-(--color-accent)">{task.agent}</span>}
                  </div>
                  <div className="text-(--color-fg-mute) truncate" title={task.description}>{task.description}</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <Metric label="in" value={task.inputTokens} />
                <Metric label="out" value={task.outputTokens} />
                <Metric label="saved" value={task.savedTokens} accent />
              </div>
              {task.activities.length > 0 && (
                <div className="border border-(--color-border) rounded bg-(--color-bg-mute) p-1.5 space-y-1">
                  <div className="flex items-center gap-1 text-[10px] text-(--color-fg-dim)">
                    <Wrench size={11} /> tools
                  </div>
                  <div className="space-y-0.5">
                    {task.activities.map((activity, idx) => (
                      <div key={`${task.id}-${idx}`} className="font-mono text-[10px] text-(--color-fg-mute) truncate" title={activity}>
                        └─ {activity}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {task.cwd && <div className="font-mono text-[10px] text-(--color-fg-dim) truncate" title={task.cwd}>cwd: {task.cwd}</div>}
              {typeof task.output === "string" && task.output && (
                <div className="max-h-24 overflow-y-auto whitespace-pre-wrap text-(--color-fg-dim) border border-(--color-border) rounded p-1.5">
                  {task.output}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value?: number; accent?: boolean }) {
  return (
    <div className="border border-(--color-border) rounded bg-(--color-bg-mute) px-2 py-1">
      <div className="text-(--color-fg-dim)">{label}</div>
      <div className={accent ? "font-mono text-(--color-accent)" : "font-mono text-(--color-fg-mute)"}>{formatNumber(value)}</div>
    </div>
  );
}
