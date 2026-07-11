import { useState } from "react";
import { Bot, Cloud, Wrench, X } from "@/components/ui/icons/compat";
import { useChat, type UiBlockTool, type UiMessage } from "@/store/chat";
import { useShallow } from "zustand/react/shallow";
import { getSubagentStatus, subagentStatusLabel, useElapsedLabel, SubagentStatusIcon } from "@/components/Chat/ToolCall";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { AgentManagerView } from "./AgentManagerView";

interface TaskInfo {
  id: string;
  taskId?: string;
  block: UiBlockTool;
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
    taskId: typeof details.taskId === "string" ? details.taskId : undefined,
    block,
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

const EMPTY_MESSAGES: UiMessage[] = [];

export function SubagentsTab() {
  const [mode, setMode] = useState<"tasks" | "agents">("tasks");
  const messages = useChat(useShallow((s) => s.tabs.get(s.activeTabId ?? "")?.messages ?? s.messages ?? EMPTY_MESSAGES));
  const tasks = messages
    .flatMap((message) => message.blocks.filter((block): block is UiBlockTool => block.kind === "tool" && block.name === "task"))
    .map(toTaskInfo)
    .reverse();
  const totalSaved = tasks.reduce((sum, task) => sum + (task.savedTokens ?? 0), 0);
  const running = tasks.filter((task) => getSubagentStatus(task.block) === "running").length;

  return (
    <div className="p-3 space-y-3 text-xs min-w-0">
      <SegmentedControl<"tasks" | "agents">
        ariaLabel="Режим панели субагентов"
        value={mode}
        onChange={setMode}
        options={[
          { value: "tasks", label: "Задачи" },
          { value: "agents", label: "Агенты" },
        ]}
      />
      {mode === "agents" ? (
        <AgentManagerView />
      ) : (
        <>
          <div
            className={
              running > 0
                ? "border border-(--color-accent)/30 bg-(--color-accent)/8 rounded-lg p-3 space-y-2"
                : "border border-(--color-border) rounded-lg bg-(--color-bg) p-3 space-y-2"
            }
          >
            <div className="flex items-center gap-2">
              <Bot size={14} className="text-(--color-accent)" />
              <div className="font-medium text-(--color-fg)">Sub-agents</div>
              <div className="ml-auto font-mono text-(--color-fg-dim)">{tasks.length}</div>
            </div>
            {running > 0 ? (
              <div className="text-(--color-accent) font-medium">
                {running} {running === 1 ? "агент работает" : "агентов работают"} параллельно
              </div>
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
                <SubagentCard key={task.id} task={task} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SubagentCard({ task }: { task: TaskInfo }) {
  const status = getSubagentStatus(task.block);
  const elapsed = useElapsedLabel(task.block.startedAt, task.block.completedAt, status === "running");
  const cancelTask = useChat((s) => s.cancelTask);
  const backgroundTask = useChat((s) => s.backgroundTask);
  const canAct = task.taskId && (status === "running" || status === "queued");
  return (
    <div
      className={
        status === "timeout" || status === "partial"
          ? "border border-(--color-warn)/30 rounded bg-(--color-warn)/5 p-2 space-y-2"
          : "border border-(--color-border) rounded bg-(--color-bg) p-2 space-y-2"
      }
    >
      <div className="flex items-start gap-2">
        <SubagentStatusIcon status={status} size={14} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 min-w-0">
            <span
              className={
                status === "error"
                  ? "font-mono text-[10px] text-(--color-danger)"
                  : status === "timeout" || status === "partial"
                    ? "font-mono text-[10px] text-(--color-warn)"
                    : "font-mono text-[10px] text-(--color-fg-dim)"
              }
            >
              {subagentStatusLabel(status)}
            </span>
            {elapsed && <span className="font-mono text-[10px] text-(--color-fg-dim)">· {elapsed}</span>}
            {task.agent && <span className="font-mono text-[10px] text-(--color-accent)">{task.agent}</span>}
          </div>
          <div className="text-(--color-fg-mute) truncate" title={task.description}>{task.description}</div>
        </div>
        {canAct && (
          <div className="flex items-center gap-1 shrink-0">
            {status === "running" && (
              <button
                type="button"
                title="Перевести в фон"
                onClick={() => backgroundTask(task.taskId!)}
                className="p-0.5 rounded hover:bg-(--color-bg-hover) text-(--color-fg-dim) hover:text-(--color-fg)"
              >
                <Cloud size={12} />
              </button>
            )}
            <button
              type="button"
              title="Отменить задачу"
              onClick={() => cancelTask(task.taskId!)}
              className="p-0.5 rounded hover:bg-(--color-bg-hover) text-(--color-fg-dim) hover:text-(--color-danger)"
            >
              <X size={12} />
            </button>
          </div>
        )}
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
