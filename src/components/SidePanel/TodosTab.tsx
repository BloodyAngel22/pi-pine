import { CheckCircle2, Circle, ListTodo } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import { useChat, type UiBlock, type UiBlockTool } from "@/store/chat";

interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  level: number;
}

interface TodoDetails {
  todos?: unknown[];
  nextId?: number;
  action?: string;
  error?: string;
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

function blocksText(blocks: UiBlock[]): string {
  return blocks
    .filter((block) => block.kind === "text")
    .map((block) => block.text)
    .join("\n");
}

function isTodoToolName(name: string): boolean {
  return name.toLowerCase().includes("todo");
}

function parseJsonMaybe(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
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
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.todos)) return record as TodoDetails;
  for (const key of ["details", "result", "output", "input", "content", "data"]) {
    const found = findTodoDetails(record[key], depth + 1);
    if (found) return found;
  }
  return null;
}

function normalizeTodoItem(value: unknown, index: number): TodoItem | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
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

function latestTodos(blocks: UiBlockTool[]): TodoItem[] {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    if (!isTodoToolName(block.name)) continue;
    const details = findTodoDetails(block.details) ?? findTodoDetails(block.output) ?? findTodoDetails(block.input);
    if (details) return details.todos?.map(normalizeTodoItem).filter((todo): todo is TodoItem => Boolean(todo)) ?? [];
  }
  return [];
}

export function TodosTab() {
  const messages = useChat((s) => s.messages);
  const planFilePath = useChat((s) => s.planFilePath);
  const planMode = useChat((s) => s.planMode);
  const isStreaming = useChat((s) => s.agentState?.isStreaming ?? false);
  const loadPlan = useChat((s) => s.loadPlan);
  const [planText, setPlanText] = useState("");
  const [planError, setPlanError] = useState<string | null>(null);
  const todoBlocks = messages.flatMap((message) =>
    message.blocks.filter((block): block is UiBlockTool => block.kind === "tool" && isTodoToolName(block.name)),
  );
  const planTodos = useMemo(() => parsePlanTasks(planText), [planText]);
  const assistantPlanTodos = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message.role !== "assistant") continue;
      const tasks = parsePlanTasks(blocksText(message.blocks));
      if (tasks.length > 0) return tasks;
    }
    return [];
  }, [messages]);
  const toolTodos = latestTodos(todoBlocks);
  const todos = planTodos.length > 0 ? planTodos : assistantPlanTodos.length > 0 ? assistantPlanTodos : toolTodos;
  const done = todos.filter((todo) => todo.done).length;
  const total = todos.length;
  const current = todos.find((todo) => !todo.done);

  useEffect(() => {
    if (!planFilePath) {
      void loadPlan().catch(() => undefined);
    }
  }, [planFilePath, loadPlan]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (!planFilePath) {
        setPlanText("");
        setPlanError(null);
        return;
      }
      void invoke<string>("read_plan_file", { path: planFilePath })
        .then((text) => {
          if (cancelled) return;
          setPlanText(text);
          setPlanError(null);
        })
        .catch((error) => {
          if (cancelled) return;
          setPlanError(String(error));
        });
    };
    load();
    if (!isStreaming) return () => {
      cancelled = true;
    };
    const timer = window.setInterval(load, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [planFilePath, planMode, isStreaming, messages.length]);

  return (
    <div className="p-3 space-y-3 text-xs min-w-0">
      <div className="border border-(--color-border) rounded-lg bg-(--color-bg) p-3 space-y-2">
        <div className="flex items-center gap-2">
          <ListTodo size={14} className="text-(--color-accent)" />
          <div className="font-medium text-(--color-fg)">Todos</div>
          <div className="ml-auto font-mono text-(--color-fg-dim)">
            {done}/{total}
          </div>
        </div>
        <div className="h-1.5 rounded-full bg-(--color-bg-mute) overflow-hidden">
          <div
            className="h-full bg-(--color-accent) transition-all"
            style={{ width: total === 0 ? "0%" : `${Math.round((done / total) * 100)}%` }}
          />
        </div>
        <div className="text-(--color-fg-mute)">
          {total === 0 ? "В plan file пока нет задач." : current ? `Сейчас: ${current.text}` : "Все задачи завершены."}
        </div>
      </div>

      {todos.length === 0 ? (
        <div className="text-(--color-fg-dim)">
          {planError ? `Не удалось прочитать plan file: ${planError}` : "Задачи появятся после чек-листа в разделе ## Tasks / ## Шаги."}
        </div>
      ) : (
        <div className="space-y-1.5">
          {todos.map((todo) => (
            <div
              key={todo.id}
              className="flex items-start gap-2 rounded border border-(--color-border) bg-(--color-bg) px-2.5 py-2"
              style={{ marginLeft: todo.level * 12 }}
            >
              {todo.done ? (
                <CheckCircle2 size={14} className="mt-0.5 text-(--color-success) shrink-0" />
              ) : (
                <Circle size={14} className="mt-0.5 text-(--color-fg-dim) shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[10px] text-(--color-fg-dim)">#{todo.id}</div>
                <div className={todo.done ? "text-(--color-fg-dim) line-through" : "text-(--color-fg)"}>{todo.text}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
