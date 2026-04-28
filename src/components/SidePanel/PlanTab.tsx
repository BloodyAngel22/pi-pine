import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ExternalLink, RefreshCw, Save, Play } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useChat } from "@/store/chat";

export function PlanTab() {
  const planMode = useChat((s) => s.planMode);
  const planFilePath = useChat((s) => s.planFilePath);
  const planLoading = useChat((s) => s.planLoading);
  const togglePlanMode = useChat((s) => s.togglePlanMode);
  const loadPlan = useChat((s) => s.loadPlan);
  const savePlan = useChat((s) => s.savePlan);
  const commitPlan = useChat((s) => s.commitPlan);

  const [text, setText] = useState("");
  const [dirty, setDirty] = useState(false);
  const lastLoadedFor = useRef<string | null>(null);
  const saveTimer = useRef<number | null>(null);

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
          disabled={!planFilePath}
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
