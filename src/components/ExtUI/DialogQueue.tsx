import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useExt, type DialogRequest } from "@/store/ext";

type DialogPayload = {
  value?: string;
  confirmed?: boolean;
  cancelled?: boolean;
  decision?: "allow-once" | "allow-always" | "deny-once" | "deny-always";
  scope?: "local" | "global" | "session";
  match?: string;
};

export function DialogQueue() {
  const queue = useExt((s) => s.dialogQueue);
  const resolve = useExt((s) => s.resolveDialog);
  const top = queue[0];
  if (!top) return null;
  return <DialogRenderer key={top.id} req={top} onResolve={resolve} />;
}

function DialogRenderer({
  req,
  onResolve,
}: {
  req: DialogRequest;
  onResolve(payload: DialogPayload): void;
}) {
  // авто-cancel по timeout
  useEffect(() => {
    if (!req.timeout) return;
    const t = window.setTimeout(() => onResolve({ cancelled: true }), req.timeout);
    return () => window.clearTimeout(t);
  }, [req, onResolve]);

  if (req.type === "select") return <SelectDialog req={req} onResolve={onResolve} />;
  if (req.type === "confirm") return <ConfirmDialog req={req} onResolve={onResolve} />;
  if (req.type === "input") return <InputDialog req={req} onResolve={onResolve} />;
  if (req.type === "askUser") return <AskUserDialog req={req} onResolve={onResolve} />;
  if (req.type === "permission") return <PermissionDialog req={req} onResolve={onResolve} />;
  return <EditorDialog req={req} onResolve={onResolve} />;
}

function SelectDialog({
  req,
  onResolve,
}: {
  req: Extract<DialogRequest, { type: "select" }>;
  onResolve(p: { value?: string; cancelled?: boolean }): void;
}) {
  const [hl, setHl] = useState(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHl((i) => (i + 1) % req.options.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHl((i) => (i <= 0 ? req.options.length - 1 : i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        onResolve({ value: req.options[hl] });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [req, hl, onResolve]);
  return (
    <Modal
      open
      title={req.title || "Выбор"}
      onClose={() => onResolve({ cancelled: true })}
      footer={
        <Button variant="ghost" size="md" onClick={() => onResolve({ cancelled: true })}>
          Отмена
        </Button>
      }
    >
      <div className="space-y-1">
        {req.options.map((opt, i) => (
          <button
            key={opt}
            type="button"
            onClick={() => onResolve({ value: opt })}
            onMouseEnter={() => setHl(i)}
            className={
              "w-full text-left px-3 py-1.5 rounded text-sm " +
              (i === hl
                ? "bg-(--color-accent-soft) text-(--color-accent)"
                : "hover:bg-(--color-bg-mute)")
            }
          >
            {opt}
          </button>
        ))}
      </div>
    </Modal>
  );
}

function ConfirmDialog({
  req,
  onResolve,
}: {
  req: Extract<DialogRequest, { type: "confirm" }>;
  onResolve(p: { confirmed?: boolean; cancelled?: boolean }): void;
}) {
  return (
    <Modal
      open
      title={req.title || "Подтверждение"}
      onClose={() => onResolve({ cancelled: true })}
      footer={
        <>
          <Button variant="ghost" size="md" onClick={() => onResolve({ confirmed: false })}>
            Нет
          </Button>
          <Button variant="primary" size="md" onClick={() => onResolve({ confirmed: true })}>
            Да
          </Button>
        </>
      }
    >
      {req.message && (
        <div className="text-sm text-(--color-fg-mute) whitespace-pre-wrap">
          {req.message}
        </div>
      )}
    </Modal>
  );
}

function InputDialog({
  req,
  onResolve,
}: {
  req: Extract<DialogRequest, { type: "input" }>;
  onResolve(p: { value?: string; cancelled?: boolean }): void;
}) {
  const [value, setValue] = useState("");
  return (
    <Modal
      open
      title={req.title || "Ввод"}
      onClose={() => onResolve({ cancelled: true })}
      footer={
        <>
          <Button variant="ghost" size="md" onClick={() => onResolve({ cancelled: true })}>
            Отмена
          </Button>
          <Button variant="primary" size="md" onClick={() => onResolve({ value })}>
            ОК
          </Button>
        </>
      }
    >
      <Input
        autoFocus
        value={value}
        placeholder={req.placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onResolve({ value });
          if (e.key === "Escape") onResolve({ cancelled: true });
        }}
      />
    </Modal>
  );
}

function AskUserDialog({
  req,
  onResolve,
}: {
  req: Extract<DialogRequest, { type: "askUser" }>;
  onResolve(p: { value?: string; cancelled?: boolean }): void;
}) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [custom, setCustom] = useState("");

  const toggle = (idx: number) => {
    setSelected((cur) => {
      const next = new Set(req.allowMultiple ? cur : []);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const submit = () => {
    const parts = [...selected]
      .sort((a, b) => a - b)
      .map((idx) => req.options[idx])
      .filter((v): v is string => typeof v === "string" && v.length > 0);
    const customText = custom.trim();
    if (customText) parts.push(customText);
    onResolve({ value: parts.join(", ") || "(no selection)" });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onResolve({ cancelled: true });
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        submit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <Modal
      open
      width="620px"
      title="Агент ждёт ответа"
      onClose={() => onResolve({ cancelled: true })}
      footer={
        <>
          <Button variant="ghost" size="md" onClick={() => onResolve({ cancelled: true })}>
            Отмена
          </Button>
          <Button variant="primary" size="md" onClick={submit}>
            Ответить
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="text-sm text-(--color-fg) whitespace-pre-wrap">
          {req.question}
        </div>
        {req.options.length > 0 && (
          <div className="space-y-1">
            {req.options.map((option, idx) => {
              const isSelected = selected.has(idx);
              return (
                <button
                  key={`${idx}:${option}`}
                  type="button"
                  onClick={() => toggle(idx)}
                  className={
                    "w-full text-left px-3 py-2 rounded border text-sm transition-colors " +
                    (isSelected
                      ? "border-(--color-accent)/50 bg-(--color-accent-soft) text-(--color-accent)"
                      : "border-(--color-border) hover:bg-(--color-bg-mute)")
                  }
                >
                  <span className="font-mono mr-2">
                    {req.allowMultiple ? (isSelected ? "[x]" : "[ ]") : isSelected ? "(•)" : "( )"}
                  </span>
                  {option}
                </button>
              );
            })}
          </div>
        )}
        <div>
          <div className="text-xs text-(--color-fg-dim) mb-1">
            Свой ответ
          </div>
          <Input
            autoFocus={req.options.length === 0}
            value={custom}
            placeholder="Введите ответ, если вариантов недостаточно…"
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit();
              if (e.key === "Escape") onResolve({ cancelled: true });
            }}
          />
        </div>
        <div className="text-[11px] text-(--color-fg-dim)">
          {req.allowMultiple ? "Можно выбрать несколько вариантов." : "Можно выбрать один вариант."} Ctrl+Enter — отправить.
        </div>
      </div>
    </Modal>
  );
}

function PermissionDialog({
  req,
  onResolve,
}: {
  req: Extract<DialogRequest, { type: "permission" }>;
  onResolve(p: DialogPayload): void;
}) {
  const [scope, setScope] = useState<"session" | "local" | "global">("session");
  const [match, setMatch] = useState(req.permissionValue);
  const typeLabel = req.permissionType === "bash" ? "Команда" : req.permissionType === "file" ? "Файл" : "Инструмент";
  const allowAlways = () => onResolve({ decision: "allow-always", scope, match: match.trim() || undefined });
  const denyAlways = () => onResolve({ decision: "deny-always", scope, match: match.trim() || undefined });

  return (
    <Modal
      open
      width="680px"
      title="Требуется разрешение"
      onClose={() => onResolve({ decision: "deny-once" })}
      footer={
        <>
          <Button variant="ghost" size="md" onClick={() => onResolve({ decision: "deny-once" })}>
            Deny once
          </Button>
          <Button variant="subtle" size="md" onClick={denyAlways}>
            Deny rule
          </Button>
          <Button variant="subtle" size="md" onClick={() => onResolve({ decision: "allow-once" })}>
            Allow once
          </Button>
          <Button variant="primary" size="md" onClick={allowAlways}>
            Allow rule
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="text-sm text-(--color-fg-mute)">
          Агент хочет выполнить действие, которое требует подтверждения.
        </div>
        <div className="border border-(--color-border) rounded bg-(--color-bg) p-3 space-y-1">
          <div className="text-[10px] uppercase text-(--color-fg-dim)">{typeLabel}</div>
          <pre className="font-mono text-xs whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
            {req.permissionValue}
          </pre>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {(["session", "local", "global"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={
                "rounded border px-2 py-1.5 text-xs " +
                (scope === s
                  ? "border-(--color-accent)/50 bg-(--color-accent-soft) text-(--color-accent)"
                  : "border-(--color-border) hover:bg-(--color-bg-mute)")
              }
            >
              {s === "session" ? "Session" : s === "local" ? "Project" : "Global"}
            </button>
          ))}
        </div>
        <div>
          <div className="text-xs text-(--color-fg-dim) mb-1">
            Pattern для persistent rule
          </div>
          <Input value={match} onChange={(e) => setMatch(e.target.value)} />
        </div>
        <div className="text-[11px] text-(--color-fg-dim)">
          `Allow once` и `Deny once` не сохраняют правило. `Allow rule` / `Deny rule` сохраняют pattern в выбранном scope.
        </div>
      </div>
    </Modal>
  );
}

function EditorDialog({
  req,
  onResolve,
}: {
  req: Extract<DialogRequest, { type: "editor" }>;
  onResolve(p: { value?: string; cancelled?: boolean }): void;
}) {
  const [value, setValue] = useState(req.prefill || "");
  return (
    <Modal
      open
      width="700px"
      title={req.title || "Редактирование"}
      onClose={() => onResolve({ cancelled: true })}
      footer={
        <>
          <Button variant="ghost" size="md" onClick={() => onResolve({ cancelled: true })}>
            Отмена
          </Button>
          <Button variant="primary" size="md" onClick={() => onResolve({ value })}>
            Сохранить
          </Button>
        </>
      }
    >
      <textarea
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full min-h-[260px] bg-(--color-bg) border border-(--color-border) rounded-md px-3 py-2 text-sm font-mono text-(--color-fg) focus:outline-none focus:border-(--color-accent)/50"
      />
    </Modal>
  );
}
