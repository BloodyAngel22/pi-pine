import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Send, Square, Paperclip, X, Terminal, Slash, Brain, Sparkles, ListTodo, Play } from "lucide-react";
import clsx from "clsx";
import { useChat, type UiBlock } from "@/store/chat";
import { useExt } from "@/store/ext";
import { t } from "@/i18n/ru";
import { BUILTIN_SLASH, SlashMenu } from "./SlashMenu";
import { ContextIndicator } from "./ContextIndicator";
import { SkillsPalette } from "./SkillsPalette";
import type { ImageContent, ThinkingLevel } from "@/rpc/types";

interface DirectoryCompletion {
  value: string;
  label: string;
  path: string;
}

interface Props {
  onSlash(cmd: string, arg?: string): void;
  onToggleBash?(): void;
  onBtw?(question?: string): void;
}

const THINKING_CYCLE: ThinkingLevel[] = ["off", "low", "medium", "high"];

function countPlanTasks(markdown: string): number {
  let count = 0;
  let inTasksSection = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^##\s/.test(line)) {
      inTasksSection = /^##\s+(tasks|todos|todo|шаги|задачи|план)\b/i.test(line);
      continue;
    }
    if (!inTasksSection) continue;
    const match = line.match(/^\s*-\s+\[[ xX]\]\s+(.+)$/);
    const text = match?.[1]?.trim();
    if (text) count += 1;
  }
  return count;
}

function hasMeaningfulPlan(markdown: string): boolean {
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^#+\s*(план|контекст|шаги|tasks|todos|todo|открытые вопросы)\s*$/i.test(line)) continue;
    if (/^_?Файл создан pi-pine\b/i.test(line)) continue;
    if (/^ID сессии:\s*`[^`]+`\s*$/i.test(line)) continue;
    if (/^-\s*(?:\[[ xX]\])?\s*$/.test(line)) continue;
    return true;
  }
  return false;
}

function blocksText(blocks: UiBlock[]): string {
  return blocks
    .filter((block) => block.kind === "text")
    .map((block) => block.text)
    .join("\n");
}

export function Composer({ onSlash, onToggleBash, onBtw }: Props) {
  const isStreaming = useChat((s) => s.agentState?.isStreaming ?? false);
  const isCompacting = useChat((s) => s.agentState?.isCompacting ?? false);
  const mcpLoading = useChat((s) => s.mcpLoading);
  const pending = useChat((s) => s.pendingMessageCount);
  const cwd = useChat((s) => s.cwd);
  const streamingBehavior = useChat((s) => s.streamingBehavior);
  const setStreamingBehavior = useChat((s) => s.setStreamingBehavior);
  const send = useChat((s) => s.send);
  const abortStreaming = useChat((s) => s.abortStreaming);
  const composerInjection = useChat((s) => s.composerInjection);
  const clearInjection = useChat((s) => s.clearComposerInjection);
  const model = useChat((s) => s.agentState?.model);
  const thinkingLevel = useChat((s) => s.agentState?.thinkingLevel);
  const setThinking = useChat((s) => s.setThinking);
  const planMode = useChat((s) => s.planMode);
  const planFilePath = useChat((s) => s.planFilePath);
  const messages = useChat((s) => s.messages);
  const togglePlanMode = useChat((s) => s.togglePlanMode);
  const commitPlan = useChat((s) => s.commitPlan);
  const attachedSkills = useChat((s) => s.attachedSkills);
  const toggleAttachedSkill = useChat((s) => s.toggleAttachedSkill);
  const yoloMode = useExt((s) => s.yoloMode);
  const toggleYoloMode = useExt((s) => s.toggleYoloMode);

  const [value, setValue] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [hIndex, setHIndex] = useState(-1);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashHighlight, setSlashHighlight] = useState(0);
  const [cdCompletions, setCdCompletions] = useState<DirectoryCompletion[]>([]);
  const [cdHighlight, setCdHighlight] = useState(0);
  const [attachments, setAttachments] = useState<ImageContent[]>([]);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [planReady, setPlanReady] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const assistantPlanReady = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message.role !== "assistant") continue;
      const text = blocksText(message.blocks);
      if (countPlanTasks(text) > 0 || hasMeaningfulPlan(text)) return true;
    }
    return false;
  }, [messages]);

  // авторесайз
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 240) + "px";
  }, [value]);

  // фокус по первому рендеру
  useEffect(() => {
    ref.current?.focus();
  }, []);

  // подстановка из set_editor_text / Edit
  useEffect(() => {
    if (composerInjection) {
      setValue(composerInjection.text);
      clearInjection();
      setTimeout(() => ref.current?.focus(), 0);
    }
  }, [composerInjection, clearInjection]);

  const onPickFile = () => fileRef.current?.click();
  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const next: ImageContent[] = [];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      const buf = await f.arrayBuffer();
      const b64 = btoa(
        new Uint8Array(buf).reduce((a, b) => a + String.fromCharCode(b), ""),
      );
      next.push({ type: "image", data: b64, mimeType: f.type });
    }
    if (next.length) setAttachments((a) => [...a, ...next]);
    if (fileRef.current) fileRef.current.value = "";
  };
  const removeAttachment = (i: number) => {
    setAttachments((a) => a.filter((_, idx) => idx !== i));
  };

  const trimmed = value.trim();
  const isSlash = trimmed.startsWith("/") && !trimmed.includes("\n");
  const slashMatch = trimmed.match(/^(\/\S+)(?:\s+([\s\S]*))?$/);
  const slashCommand = slashMatch?.[1] ?? trimmed;
  const slashArg = slashMatch?.[2]?.trim() ?? "";
  const isCdCommand = isSlash && slashCommand === "/cd";
  const slashItems = isSlash
    ? BUILTIN_SLASH.filter((c) =>
        c.command.toLowerCase().startsWith(slashCommand.toLowerCase()),
      )
    : [];

  const submit = async () => {
    if (!trimmed && attachments.length === 0) return;
    if (mcpLoading) return;
    if (isSlash && slashItems.length > 0) {
      const picked = slashItems[Math.min(slashHighlight, slashItems.length - 1)];
      if (picked.command === "/btw") {
        onBtw?.();
        setValue("");
        setSlashOpen(false);
        return;
      }
      onSlash(picked.command, slashArg);
      setValue("");
      return;
    }
    const btwMatch = trimmed.match(/^\/btw(?:\s+([\s\S]+))?$/i);
    if (btwMatch) {
      const question = (btwMatch[1] ?? "").trim();
      if (!question) {
        setValue("/btw ");
        setSlashOpen(false);
        setTimeout(() => ref.current?.focus(), 0);
        return;
      }
      setHistory((h) => [...h, trimmed].slice(-50));
      setAttachments([]);
      setHIndex(-1);
      setValue("");
      onBtw?.(question);
      return;
    }
    if (trimmed) {
      setHistory((h) => [...h, trimmed].slice(-50));
    }
    const imgs = attachments;
    setAttachments([]);
    setHIndex(-1);
    setValue("");
    await send(trimmed, imgs);
  };

  const completeCd = async () => {
    if (!isCdCommand) return false;
    const current = slashMatch?.[2] ?? "";
    try {
      const items = await invoke<DirectoryCompletion[]>("complete_directories", {
        cwd,
        input: current.trimStart(),
        limit: 80,
      });
      if (items.length === 0) {
        setCdCompletions([]);
        return true;
      }
      if (items.length === 1) {
        setValue(`/cd ${items[0].value}`);
        setCdCompletions([]);
        setTimeout(() => ref.current?.focus(), 0);
        return true;
      }
      setCdCompletions(items);
      setCdHighlight(0);
      return true;
    } catch {
      setCdCompletions([]);
      return true;
    }
  };

  const cycleThinking = () => {
    const cur = thinkingLevel ?? "off";
    const idx = THINKING_CYCLE.indexOf(cur);
    const next = THINKING_CYCLE[(idx + 1) % THINKING_CYCLE.length];
    void setThinking(next);
  };

  const insertSlash = () => {
    if (!value.startsWith("/")) {
      setValue("/" + value);
      setSlashOpen(true);
      setTimeout(() => ref.current?.focus(), 0);
    }
  };

  // Глобальный хоткей Ctrl+/ — палитра скиллов
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        setSkillsOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadPlanTasks = () => {
      if (!planMode || !planFilePath) {
        setPlanReady(false);
        return;
      }
      void invoke<string>("read_plan_file", { path: planFilePath })
        .then((text) => {
          if (!cancelled) {
            setPlanReady(hasMeaningfulPlan(text));
          }
        })
        .catch(() => {
          if (!cancelled) {
            setPlanReady(false);
          }
        });
    };
    loadPlanTasks();
    if (!planMode || !planFilePath) {
      return () => {
        cancelled = true;
      };
    }
    const timer = window.setInterval(loadPlanTasks, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [planMode, planFilePath, isStreaming]);

  return (
    <div className="bg-(--color-bg) px-3 pb-3 pt-1 relative">
      <SkillsPalette
        open={skillsOpen}
        onClose={() => setSkillsOpen(false)}
        onInsert={(text) => {
          setValue((v) => (v ? `${v}\n\n${text}` : text));
          setTimeout(() => ref.current?.focus(), 0);
        }}
      />
      <div className="max-w-[850px] mx-auto">
        {/* Тонкая полоса-статус сверху композера, как в Windsurf */}
        {(isStreaming || isCompacting || pending > 0) && (
          <div className="px-2 mb-1 text-[11px] text-(--color-fg-mute) flex items-center gap-2">
            {isStreaming && (
              <span className="inline-flex items-center gap-1 text-(--color-accent)">
                <span className="w-1.5 h-1.5 rounded-full bg-(--color-accent) animate-pulse" />
                {t.chat.streaming}
              </span>
            )}
            {isCompacting && <span>◌ {t.chat.compacting}</span>}
            {pending > 0 && (
              <span>
                {pending} {t.chat.queued}
              </span>
            )}
            {isStreaming && (
              <div className="ml-auto flex items-center gap-1">
                <span className="text-(--color-fg-dim)">режим:</span>
                <button
                  type="button"
                  onClick={() => setStreamingBehavior("steer")}
                  className={clsx(
                    "px-1.5 py-0.5 rounded transition-colors",
                    streamingBehavior === "steer"
                      ? "bg-(--color-accent-soft) text-(--color-accent)"
                      : "hover:bg-(--color-bg-mute) text-(--color-fg-mute)",
                  )}
                >
                  {t.chat.streamingBehavior.steer}
                </button>
                <button
                  type="button"
                  onClick={() => setStreamingBehavior("followUp")}
                  className={clsx(
                    "px-1.5 py-0.5 rounded transition-colors",
                    streamingBehavior === "followUp"
                      ? "bg-(--color-accent-soft) text-(--color-accent)"
                      : "hover:bg-(--color-bg-mute) text-(--color-fg-mute)",
                  )}
                >
                  {t.chat.streamingBehavior.followUp}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Plan-mode и закреплённые скиллы */}
        {(planMode || attachedSkills.length > 0) && (
          <div className="flex items-center gap-1.5 px-1 mb-1 flex-wrap">
            {planMode && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-(--color-warn)/15 text-(--color-warn) border border-(--color-warn)/30">
                <ListTodo size={10} />
                Plan mode
              </span>
            )}
            {attachedSkills.map((name) => (
              <span
                key={name}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-(--color-accent-soft)/40 text-(--color-accent) border border-(--color-accent)/30 font-mono"
              >
                /skill:{name}
                <button
                  type="button"
                  onClick={() => toggleAttachedSkill(name)}
                  className="hover:text-(--color-fg)"
                >
                  <X size={9} />
                </button>
              </span>
            ))}
          </div>
        )}

        {planMode && planFilePath && (planReady || assistantPlanReady) && (
          <div className="mb-2 rounded-lg border border-(--color-warn)/35 bg-(--color-warn)/10 px-3 py-2 flex items-center gap-2">
            <ListTodo size={14} className="text-(--color-warn) shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-(--color-fg)">План готов к реализации</div>
              <div className="text-[10px] text-(--color-fg-dim) truncate" title={planFilePath}>
                {planFilePath}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void commitPlan()}
              disabled={isStreaming || mcpLoading}
              className={clsx(
                "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium transition-colors shrink-0",
                isStreaming || mcpLoading
                  ? "bg-(--color-bg-mute) text-(--color-fg-dim) cursor-not-allowed"
                  : "bg-(--color-warn) text-(--color-bg) hover:opacity-90",
              )}
              title="Выполнить текущий план (/execute)"
            >
              <Play size={12} />
              Реализовать
            </button>
          </div>
        )}

        {/* Карточка композера в стиле Windsurf */}
        <div className={clsx("relative pi-composer-card group/composer", planMode && "!border-(--color-warn)/40")}>
          {isCdCommand && cdCompletions.length > 0 && (
            <div className="absolute left-3 right-3 bottom-full mb-2 max-h-56 overflow-y-auto bg-(--color-bg-soft) border border-(--color-border) rounded-md shadow-2xl text-xs">
              <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-(--color-fg-dim) border-b border-(--color-border)">
                cd directories
              </div>
              {cdCompletions.map((item, i) => (
                <button
                  key={item.path}
                  type="button"
                  onMouseEnter={() => setCdHighlight(i)}
                  onClick={() => {
                    setValue(`/cd ${item.value}`);
                    setCdCompletions([]);
                    setTimeout(() => ref.current?.focus(), 0);
                  }}
                  className={clsx(
                    "w-full text-left px-3 py-1.5 flex items-center gap-2 font-mono",
                    i === cdHighlight ? "bg-(--color-bg-mute)" : "hover:bg-(--color-bg-mute)/60",
                  )}
                  title={item.path}
                >
                  <span className="text-(--color-accent) truncate">{item.value}</span>
                </button>
              ))}
            </div>
          )}
          {isSlash && slashItems.length > 0 && slashOpen && (
            <SlashMenu
              query={trimmed}
              highlight={slashHighlight}
              onPick={(cmd) => {
                if (cmd === "/btw") {
                  onBtw?.();
                  setValue("");
                  setSlashOpen(false);
                  return;
                }
                onSlash(cmd, slashArg);
                setValue("");
              }}
              onHover={setSlashHighlight}
            />
          )}

          {/* Прикреплённые изображения */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-2.5 pt-2">
              {attachments.map((img, i) => (
                <div
                  key={i}
                  className="relative inline-flex items-center gap-1.5 bg-(--color-bg-mute) border border-(--color-border) rounded-md pl-1 pr-1.5 py-1 text-xs"
                >
                  <img
                    src={`data:${img.mimeType};base64,${img.data}`}
                    alt=""
                    className="h-7 w-7 object-cover rounded"
                  />
                  <span className="font-mono text-(--color-fg-dim) truncate max-w-[100px]">
                    {img.mimeType.replace("image/", "")}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(i)}
                    className="text-(--color-fg-dim) hover:text-(--color-danger)"
                    title="Удалить"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={onFileChange}
          />

          {/* Textarea */}
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              const tt = e.target.value.trim();
              setSlashOpen(tt.startsWith("/") && !tt.includes("\n"));
              setSlashHighlight(0);
              setCdCompletions([]);
            }}
            onFocus={() => {
              if (trimmed.startsWith("/") && !trimmed.includes("\n")) {
                setSlashOpen(true);
              }
            }}
            onKeyDown={(e) => {
              if (isCdCommand && cdCompletions.length > 0) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setCdHighlight((i) => (i + 1) % cdCompletions.length);
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setCdHighlight((i) => (i <= 0 ? cdCompletions.length - 1 : i - 1));
                  return;
                }
                if (e.key === "Tab" || e.key === "Enter") {
                  e.preventDefault();
                  const picked = cdCompletions[cdHighlight];
                  if (picked) {
                    setValue(`/cd ${picked.value}`);
                    setCdCompletions([]);
                  }
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setCdCompletions([]);
                  return;
                }
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
                return;
              }
              if (slashOpen && slashItems.length > 0) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setSlashHighlight((i) => (i + 1) % slashItems.length);
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setSlashHighlight((i) =>
                    i <= 0 ? slashItems.length - 1 : i - 1,
                  );
                  return;
                }
                if (e.key === "Tab") {
                  e.preventDefault();
                  if (isCdCommand && slashCommand === "/cd") {
                    setSlashOpen(false);
                    void completeCd();
                    return;
                  }
                  setValue(slashItems[slashHighlight].command + " ");
                  setSlashOpen(false);
                  return;
                }
                if (e.key === "Escape") {
                  setSlashOpen(false);
                  return;
                }
              }
              // история
              if (e.key === "ArrowUp" && value === "") {
                e.preventDefault();
                if (history.length === 0) return;
                const next = hIndex < 0 ? history.length - 1 : Math.max(0, hIndex - 1);
                setHIndex(next);
                setValue(history[next] ?? "");
                return;
              }
              if (e.key === "ArrowDown" && hIndex >= 0) {
                e.preventDefault();
                const next = hIndex + 1;
                if (next >= history.length) {
                  setHIndex(-1);
                  setValue("");
                } else {
                  setHIndex(next);
                  setValue(history[next] ?? "");
                }
                return;
              }
              if (e.key === "Escape" && isStreaming) {
                e.preventDefault();
                void abortStreaming();
              }
            }}
            placeholder={
              isStreaming ? t.chat.placeholderStreaming : t.chat.placeholder
            }
            rows={1}
            className="block w-full bg-transparent border-0 outline-none resize-none px-3 pt-2.5 pb-1 text-sm text-(--color-fg) placeholder:text-(--color-fg-dim)"
          />

          {/* Footer toolbar внутри карточки */}
          <div className="flex items-center gap-0.5 px-1.5 pb-1.5 pt-0.5">
            <ToolBtn
              icon={<Paperclip size={13} />}
              onClick={onPickFile}
              title="Прикрепить изображение"
            />
            <ToolBtn
              icon={<Slash size={13} />}
              onClick={insertSlash}
              title="Slash-команда"
            />
            <ToolBtn
              icon={<Sparkles size={13} />}
              onClick={() => setSkillsOpen((v) => !v)}
              title="Палитра скиллов (Ctrl+/)"
            />
            <ToolBtn
              icon={<ListTodo size={13} />}
              onClick={() => void togglePlanMode()}
              title={planMode ? "Выключить Plan mode" : "Включить Plan mode"}
            />
            <button
              type="button"
              onClick={toggleYoloMode}
              className={clsx(
                "h-6 px-1.5 rounded text-[10px] font-semibold transition-colors",
                yoloMode
                  ? "bg-(--color-danger)/15 text-(--color-danger) border border-(--color-danger)/30"
                  : "text-(--color-fg-dim) hover:text-(--color-fg-mute) hover:bg-(--color-bg-mute)",
              )}
              title={yoloMode ? "YOLO включён: разрешения подтверждаются автоматически" : "YOLO: автоматически разрешать команды и доступы"}
            >
              YOLO
            </button>
            {onToggleBash && (
              <ToolBtn
                icon={<Terminal size={13} />}
                onClick={onToggleBash}
                title="Bash (Ctrl+`)"
              />
            )}
            <div className="h-4 w-px bg-(--color-border) mx-1" />
            {model && (
              <span
                className="px-1.5 py-0.5 text-[11px] text-(--color-fg-mute) font-mono truncate max-w-[180px]"
                title={`${model.provider}/${model.id}`}
              >
                {model.id}
              </span>
            )}
            {thinkingLevel && (
              <button
                type="button"
                onClick={cycleThinking}
                className={clsx(
                  "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] transition-colors",
                  thinkingLevel === "off"
                    ? "text-(--color-fg-dim) hover:text-(--color-fg-mute) hover:bg-(--color-bg-mute)"
                    : "text-(--color-accent) hover:bg-(--color-accent-soft)",
                )}
                title="Переключить уровень thinking"
              >
                <Brain size={11} />
                {thinkingLevel}
              </button>
            )}
            <div className="flex-1" />
            <ContextIndicator variant="composer" />
            {isStreaming ? (
              <button
                type="button"
                onClick={() => void abortStreaming()}
                className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md bg-(--color-danger)/15 text-(--color-danger) hover:bg-(--color-danger)/25 text-xs font-medium transition-colors"
              >
                <Square size={12} />
                {t.chat.abort}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void submit()}
                disabled={(!trimmed && attachments.length === 0) || mcpLoading}
                className={clsx(
                  "inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors",
                  (!trimmed && attachments.length === 0) || mcpLoading
                    ? "bg-(--color-bg-mute) text-(--color-fg-dim) cursor-not-allowed"
                    : "bg-(--color-accent) text-(--color-bg) hover:opacity-90",
                )}
                title={mcpLoading ? "MCP загружаются…" : `${t.composer.send} (Enter)`}
              >
                <Send size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Подсказка под композером */}
        <div className="mt-1 px-2 text-[10px] text-(--color-fg-dim) flex items-center gap-2">
          {mcpLoading && (
            <span className="text-(--color-warn)">MCP загружаются…</span>
          )}
          <span>
            <kbd className="pi-kbd">Enter</kbd> отправить
          </span>
          <span>
            <kbd className="pi-kbd">Shift+Enter</kbd> новая строка
          </span>
          <span>
            <kbd className="pi-kbd">/</kbd> команды
          </span>
          <span className="ml-auto">
            <kbd className="pi-kbd">Ctrl+`</kbd> bash
          </span>
        </div>
      </div>
    </div>
  );
}

function ToolBtn({
  icon,
  onClick,
  title,
}: {
  icon: React.ReactNode;
  onClick(): void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="inline-flex items-center justify-center h-7 w-7 rounded-md text-(--color-fg-mute) hover:bg-(--color-bg-mute) hover:text-(--color-fg) transition-colors"
    >
      {icon}
    </button>
  );
}
