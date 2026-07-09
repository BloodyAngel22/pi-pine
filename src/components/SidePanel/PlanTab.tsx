import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CheckCircle2, Circle, ExternalLink, RefreshCw, RotateCcw, Save, Play } from "@/components/ui/icons/compat";
import { Button } from "@/components/ui/Button";
import { isPlaceholderPlan, parsePlanTasks } from "@/lib/planStatus";
import { useChat } from "@/store/chat";

export function PlanTab() {
  const planMode = useChat((s) => s.planMode);
  const planFilePath = useChat((s) => s.planFilePath);
  const planLoading = useChat((s) => s.planLoading);
  const planRefreshNonce = useChat((s) => s.planRefreshNonce);
  const togglePlanMode = useChat((s) => s.togglePlanMode);
  const loadPlan = useChat((s) => s.loadPlan);
  const resetPlan = useChat((s) => s.resetPlan);
  const savePlan = useChat((s) => s.savePlan);
  const commitPlan = useChat((s) => s.commitPlan);

  const [text, setText] = useState("");
  const [dirty, setDirty] = useState(false);
  const lastLoadedFor = useRef<string | null>(null);
  const lastRefreshNonce = useRef<number>(0);
  const saveTimer = useRef<number | null>(null);
  const tasks = parsePlanTasks(text);
  const completedTasks = tasks.filter((task) => task.done).length;
  const activeTask = tasks.find((task) => !task.done);

  // при изменении planFilePath — перечитать
  useEffect(() => {
    if (!planFilePath) {
      setText("");
      lastLoadedFor.current = null;
      return;
    }
    if (lastLoadedFor.current === planFilePath) return;
    lastLoadedFor.current = planFilePath;
    void invoke<string>("read_plan_file", { path: planFilePath })
      .then((s) => {
        setText(s);
        setDirty(false);
      })
      .catch(() => undefined);
  }, [planFilePath]);

  // авто-сохранение при изменении (debounce)
  useEffect(() => {
    if (!planFilePath || !dirty) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void savePlan(text);
      setDirty(false);
    }, 700);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [text, dirty, planFilePath, savePlan]);

  const reload = async () => {
    if (!planFilePath) return;
    const s = await invoke<string>("read_plan_file", { path: planFilePath });
    setText(s);
    setDirty(false);
  };

  // pi-mono-x пишет план напрямую на диск (не через Tauri) — после каждого
  // хода агента (turn_end) store бампает planRefreshNonce, и мы перечитываем файл.
  useEffect(() => {
    if (!planFilePath) return;
    if (lastRefreshNonce.current === planRefreshNonce) return;
    lastRefreshNonce.current = planRefreshNonce;
    void reload();
  }, [planRefreshNonce, planFilePath]);

  if (!planMode) {
    return (
      <div className="p-3 space-y-3 text-xs">
        <div className="text-(--color-fg-mute)">
          Режим планирования выключен. В этом режиме pi сначала исследует код и
          ведёт план в .md-файле, не редактируя проект.
        </div>
        <Button variant="primary" size="sm" onClick={() => void togglePlanMode()}>
          Включить Plan mode
        </Button>
      </div>
    );
  }

  return (
    <div className="p-2 flex flex-col h-full gap-2 text-xs">
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          icon={<RefreshCw size={11} />}
          onClick={() => void reload()}
          disabled={!planFilePath || planLoading}
        >
          Обновить
        </Button>
        {planFilePath && (
          <Button
            variant="ghost"
            size="sm"
            icon={<ExternalLink size={11} />}
            onClick={() => void invoke("open_in_default_app", { path: planFilePath })}
          >
            файл
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          icon={<RotateCcw size={11} />}
          onClick={() => {
            if (!window.confirm("Создать новый план? Текущий файл плана останется на диске, но перестанет быть активным.")) return;
            void resetPlan();
          }}
          disabled={planLoading}
        >
          Новый план
        </Button>
        <div className="flex-1" />
        {dirty ? (
          <span className="text-[10px] text-(--color-warn)">несохр.</span>
        ) : planFilePath ? (
          <span className="text-[10px] text-(--color-success)">
            <Save size={10} className="inline mr-0.5" />
            сохранено
          </span>
        ) : null}
      </div>
      <div className="font-mono text-[10px] text-(--color-fg-dim) truncate" title={planFilePath ?? ""}>
        {planFilePath ?? "—"}
      </div>
      {tasks.length > 0 && (
        <div className="border border-(--color-border) rounded bg-(--color-bg) p-2 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-(--color-accent)">Tasks</span>
            <span className="ml-auto font-mono text-(--color-fg-dim)">
              {completedTasks}/{tasks.length}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-(--color-bg-mute) overflow-hidden">
            <div
              className="h-full bg-(--color-accent) transition-all"
              style={{ width: `${Math.round((completedTasks / tasks.length) * 100)}%` }}
            />
          </div>
          {activeTask && (
            <div className="text-(--color-fg-mute) truncate" title={activeTask.text}>
              Сейчас: {activeTask.text}
            </div>
          )}
          <div className="max-h-28 overflow-y-auto space-y-1">
            {tasks.slice(0, 8).map((task, idx) => (
              <div key={`${idx}:${task.text}`} className="flex items-start gap-1.5" style={{ paddingLeft: task.level * 10 }}>
                {task.done ? (
                  <CheckCircle2 size={12} className="mt-0.5 text-(--color-success) shrink-0" />
                ) : (
                  <Circle size={12} className="mt-0.5 text-(--color-fg-dim) shrink-0" />
                )}
                <span className={task.done ? "text-(--color-fg-dim) line-through truncate" : "text-(--color-fg-mute) truncate"}>
                  {task.text}
                </span>
              </div>
            ))}
            {tasks.length > 8 && (
              <div className="text-(--color-fg-dim)">… ещё {tasks.length - 8}</div>
            )}
          </div>
        </div>
      )}
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setDirty(true);
        }}
        placeholder="План будет здесь… попроси pi подготовить план задачи."
        className="flex-1 min-h-[300px] resize-none bg-(--color-bg-mute) border border-(--color-border) rounded p-2 font-mono text-xs outline-none focus:border-(--color-accent)"
        spellCheck={false}
      />
      <div className="flex items-center gap-1.5 pt-1">
        <Button
          variant="primary"
          size="sm"
          icon={<Play size={11} />}
          onClick={() => void commitPlan()}
          disabled={!planFilePath || isPlaceholderPlan(text, tasks)}
          title={isPlaceholderPlan(text, tasks) ? "План ещё пуст — попроси pi заполнить задачи" : undefined}
        >
          Реализовать
        </Button>
        <Button
          variant="subtle"
          size="sm"
          onClick={() => void togglePlanMode()}
        >
          Выкл. Plan mode
        </Button>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void savePlan(text);
            setDirty(false);
          }}
          disabled={!planFilePath}
        >
          Сохранить
        </Button>
      </div>
      <div className="text-[10px] text-(--color-fg-dim)">
        В режиме планирования сообщения автоматически получают системную инструкцию: модель только читает код и обновляет этот файл.
      </div>
    </div>
  );
}
