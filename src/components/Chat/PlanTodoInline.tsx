import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CheckCircle2, ChevronDown, ChevronRight, Circle, ListTodo } from "lucide-react";
import clsx from "clsx";
import { useChat, type UiBlock, type UiBlockTool } from "@/store/chat";

interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  level: number;
}

interface TodoDetails {
  todos?: unknown[];
  action?: string;
  error?: string;
}

function blocksText(blocks: UiBlock[]): string {
  return blocks
    .filter((block) => block.kind === "text")
    .map((block) => block.text)
    .join("\n");
}

function parsePlanTasks(markdown: string): TodoItem[] {
  const tasks: TodoItem[] = [];
  let inTasksSection = false;
  let inCodeBlock = false;
  for (const line of markdown.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^```/.test(trimmed)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    if (/^#{1,6}\s/.test(line)) {
      inTasksSection = /^#{1,6}\s+(tasks|todos|todo|шаги|задачи|план|plan)\b/i.test(line);
      continue;
    }
    if (/^\*{0,2}Plan:\*{0,2}\s*$/i.test(trimmed)) {
      inTasksSection = true;
      continue;
    }
    if (!inTasksSection || !trimmed) continue;
    const checkbox = line.match(/^(\s*)[-*]\s+\[([ xX])\]\s+(.+)$/);
    const numbered = line.match(/^(\s*)(\d+)[.)]\s+(.+)$/);
    const bullet = line.match(/^(\s*)[-*]\s+(.+)$/);
    const text = (checkbox?.[3] ?? numbered?.[3] ?? bullet?.[2] ?? "")
      .replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .trim();
    if (!text) continue;
    tasks.push({
      id: String(tasks.length + 1),
      text,
      done: checkbox?.[2]?.toLowerCase() === "x",
      level: Math.floor(((checkbox?.[1] ?? numbered?.[1] ?? bullet?.[1])?.length ?? 0) / 2),
    });
  }
  return tasks;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function parseJsonMaybe(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeTodoItem(value: unknown, index: number): TodoItem | null {
  const item = asRecord(value);
  const text = String(item.text ?? item.content ?? item.title ?? "").trim();
  if (!text) return null;
  const status = String(item.status ?? "").toLowerCase();
  return {
    id: String(item.id ?? index + 1),
    text,
    done: item.done === true || status === "completed" || status === "done",
    level: 0,
  };
}

function findTodoDetails(value: unknown, depth = 0): TodoDetails | null {
  if (depth > 4 || value == null) return null;
  if (typeof value === "string") return findTodoDetails(parseJsonMaybe(value), depth + 1);
  if (Array.isArray(value)) {
    if (value.every((item) => normalizeTodoItem(item, 0))) return { todos: value };
    for (const item of value) {
      const found = findTodoDetails(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const record = asRecord(value);
  if (Array.isArray(record.todos)) return record as TodoDetails;
  for (const key of ["details", "result", "output", "input", "content", "data"]) {
    const found = findTodoDetails(record[key], depth + 1);
    if (found) return found;
  }
  return null;
}

function isTodoToolName(name: string): boolean {
  return name.toLowerCase().includes("todo");
}

function latestToolTodos(messages: ReturnType<typeof useChat.getState>["messages"]): TodoItem[] {
  const blocks = messages.flatMap((message) =>
    message.blocks.filter((block): block is UiBlockTool => block.kind === "tool" && isTodoToolName(block.name)),
  );
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    const details = findTodoDetails(block.details) ?? findTodoDetails(block.output) ?? findTodoDetails(block.input);
    const todos = details?.todos?.map(normalizeTodoItem).filter((todo): todo is TodoItem => Boolean(todo)) ?? [];
    if (todos.length > 0) return todos;
  }
  return [];
}

interface Props {
  tabId?: string | null;
  active?: boolean;
}

const EMPTY_MESSAGES: ReturnType<typeof useChat.getState>["messages"] = [];

export function PlanTodoInline({ tabId, active = true }: Props) {
  const messages = useChat((s) => (tabId ? (s.tabs.get(tabId)?.messages ?? EMPTY_MESSAGES) : s.messages));
  const planMode = useChat((s) => (tabId ? (s.tabs.get(tabId)?.planMode ?? false) : s.planMode));
  const planFilePath = useChat((s) => (tabId ? (s.tabs.get(tabId)?.planFilePath ?? null) : s.planFilePath));
  const isStreaming = useChat((s) => (tabId ? (s.tabs.get(tabId)?.agentState?.isStreaming ?? false) : (s.agentState?.isStreaming ?? false)));
  const loadPlan = useChat((s) => s.loadPlan);
  const [planText, setPlanText] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (active && planMode && !planFilePath) {
      void loadPlan().catch(() => undefined);
    }
  }, [active, planMode, planFilePath, loadPlan]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (!active || !planFilePath) {
        setPlanText("");
        return;
      }
      void invoke<string>("read_plan_file", { path: planFilePath })
        .then((text) => {
          if (!cancelled) setPlanText(text);
        })
        .catch(() => {
          if (!cancelled) setPlanText("");
        });
    };
    load();
    if (!active || !planFilePath) {
      return () => {
        cancelled = true;
      };
    }
    const timer = window.setInterval(load, isStreaming ? 1500 : 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [active, planFilePath, isStreaming, messages.length]);

  const todos = useMemo(() => {
    const planTodos = parsePlanTasks(planText);
    if (planTodos.length > 0) return planTodos;
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message.role !== "assistant") continue;
      const tasks = parsePlanTasks(blocksText(message.blocks));
      if (tasks.length > 0) return tasks;
    }
    return latestToolTodos(messages);
  }, [messages, planText]);

  if (todos.length === 0) return null;

  const done = todos.filter((todo) => todo.done).length;
  const total = todos.length;
  const current = todos.find((todo) => !todo.done);
  const visibleTodos = collapsed ? todos.slice(0, 4) : todos;

  return (
    <div className="sticky top-0 z-10 mx-auto w-full max-w-[850px] px-4 pt-3 pb-2 bg-(--color-bg)">
      <div className="rounded-xl border border-(--color-border) bg-(--color-bg-soft) shadow-sm overflow-hidden text-xs">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="w-full px-3 py-2 flex items-center gap-2 hover:bg-(--color-bg-mute) text-left"
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          <ListTodo size={14} className="text-(--color-accent)" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-medium text-(--color-fg)">Задачи плана</span>
              <span className="font-mono text-(--color-fg-dim)">{done}/{total}</span>
              {done === total && <span className="text-(--color-success)">complete</span>}
            </div>
            {current && <div className="text-[11px] text-(--color-fg-mute) truncate">Сейчас: {current.text}</div>}
          </div>
          <div className="w-24 h-1.5 rounded-full bg-(--color-bg) overflow-hidden border border-(--color-border)">
            <div
              className={clsx("h-full transition-all", done === total ? "bg-(--color-success)" : "bg-(--color-accent)")}
              style={{ width: `${Math.round((done / total) * 100)}%` }}
            />
          </div>
        </button>
        {!collapsed && (
          <div className="border-t border-(--color-border) bg-(--color-bg) py-1">
            {visibleTodos.map((todo) => (
              <div
                key={`${todo.id}:${todo.text}`}
                className="flex items-start gap-2 px-3 py-1.5"
                style={{ paddingLeft: 12 + todo.level * 14 }}
              >
                {todo.done ? (
                  <CheckCircle2 size={14} className="mt-0.5 text-(--color-success) shrink-0" />
                ) : current?.id === todo.id ? (
                  <span className="mt-1.5 w-2 h-2 rounded-full bg-(--color-accent) animate-pulse shrink-0" />
                ) : (
                  <Circle size={14} className="mt-0.5 text-(--color-fg-dim) shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <span className="font-mono text-[10px] text-(--color-fg-dim) mr-1">#{todo.id}</span>
                  <span className={todo.done ? "text-(--color-fg-dim) line-through" : "text-(--color-fg-mute)"}>
                    {todo.text}
                  </span>
                </div>
              </div>
            ))}
            {collapsed && todos.length > visibleTodos.length && (
              <div className="px-3 py-1 text-(--color-fg-dim)">… ещё {todos.length - visibleTodos.length}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
