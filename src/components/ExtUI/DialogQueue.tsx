import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useExt, type DialogRequest } from "@/store/ext";

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
  onResolve(payload: { value?: string; confirmed?: boolean; cancelled?: boolean }): void;
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
