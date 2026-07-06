import { useEffect, useMemo, useState } from "react";
import { Cloud, Plus, Server, Trash2 } from "@/components/ui/icons/compat";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Switch } from "@/components/ui/Switch";
import type { McpServer } from "./McpTab";

export interface McpServerSavePayload {
  name: string;
  originalName: string | null;
  kind: "local" | "remote";
  command: string | null;
  args: string[];
  url: string | null;
  disabled: boolean;
  envSet: Record<string, string>;
  envRemove: string[];
  headersSet: Record<string, string>;
  headersRemove: string[];
}

interface KvRow {
  id: string;
  key: string;
  value: string;
  existing: boolean;
  markedRemove: boolean;
}

let rowSeq = 0;
function newRowId(): string {
  rowSeq += 1;
  return `row-${rowSeq}`;
}

function rowsFromKeys(keys: string[]): KvRow[] {
  return keys.map((key) => ({ id: newRowId(), key, value: "", existing: true, markedRemove: false }));
}

function buildSetRemove(rows: KvRow[]): { set: Record<string, string>; remove: string[] } {
  const set: Record<string, string> = {};
  const remove: string[] = [];
  for (const row of rows) {
    const key = row.key.trim();
    if (!key) continue;
    if (row.existing && row.markedRemove) {
      remove.push(key);
      continue;
    }
    if (row.value.trim() !== "") set[key] = row.value;
  }
  return { set, remove };
}

export function McpServerEditorDialog({
  open,
  server,
  existingNames,
  onClose,
  onSave,
}: {
  open: boolean;
  server: McpServer | null;
  existingNames: string[];
  onClose(): void;
  onSave(payload: McpServerSavePayload): Promise<void>;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"local" | "remote">("local");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [url, setUrl] = useState("");
  const [disabled, setDisabled] = useState(false);
  const [envRows, setEnvRows] = useState<KvRow[]>([]);
  const [headerRows, setHeaderRows] = useState<KvRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(server?.name ?? "");
    setKind(server?.kind === "remote" ? "remote" : "local");
    setCommand(server?.command ?? "");
    setArgs(server?.args.join(" ") ?? "");
    setUrl(server?.url ?? "");
    setDisabled(server?.disabled ?? false);
    setEnvRows(rowsFromKeys(server?.env_keys ?? []));
    setHeaderRows(rowsFromKeys(server?.headers_keys ?? []));
    setError(null);
  }, [open, server]);

  const duplicate = useMemo(() => {
    const trimmed = name.trim();
    if (!trimmed) return false;
    if (server?.name === trimmed) return false;
    return existingNames.includes(trimmed);
  }, [name, existingNames, server?.name]);

  if (!open) return null;

  const rows = kind === "local" ? envRows : headerRows;
  const setRows = kind === "local" ? setEnvRows : setHeaderRows;

  const updateRow = (id: string, patch: Partial<KvRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };
  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };
  const addRow = () => {
    setRows((prev) => [...prev, { id: newRowId(), key: "", value: "", existing: false, markedRemove: false }]);
  };

  const save = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Укажи имя сервера");
      return;
    }
    if (duplicate) {
      setError("Сервер с таким именем уже есть");
      return;
    }
    if (kind === "local" && !command.trim()) {
      setError("Укажи command для локального сервера");
      return;
    }
    if (kind === "remote" && !url.trim()) {
      setError("Укажи url для удалённого сервера");
      return;
    }
    const env = buildSetRemove(envRows);
    const headers = buildSetRemove(headerRows);
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: trimmedName,
        originalName: server?.name ?? null,
        kind,
        command: kind === "local" ? command.trim() : null,
        args: kind === "local" ? args.trim().split(/\s+/).filter(Boolean) : [],
        url: kind === "remote" ? url.trim() : null,
        disabled,
        envSet: kind === "local" ? env.set : {},
        envRemove: kind === "local" ? env.remove : [],
        headersSet: kind === "remote" ? headers.set : {},
        headersRemove: kind === "remote" ? headers.remove : [],
      });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={server ? "Редактировать MCP-сервер" : "Новый MCP-сервер"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button variant="primary" onClick={() => void save()} disabled={saving || !name.trim() || duplicate}>
            Сохранить
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Тип">
          <div className="flex gap-2">
            <KindButton icon={<Server size={12} />} label="local" active={kind === "local"} onClick={() => setKind("local")} />
            <KindButton icon={<Cloud size={12} />} label="remote" active={kind === "remote"} onClick={() => setKind("remote")} />
          </div>
        </Field>

        <Field label="Имя">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-server" />
        </Field>

        {kind === "local" ? (
          <>
            <Field label="Command">
              <Input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="npx" />
            </Field>
            <Field label="Args" hint="через пробел">
              <Input value={args} onChange={(e) => setArgs(e.target.value)} placeholder="-y @modelcontextprotocol/server-everything" />
            </Field>
          </>
        ) : (
          <Field label="URL">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/mcp" />
          </Field>
        )}

        <Field label={kind === "local" ? "Env" : "Headers"}>
          <div className="space-y-1.5">
            {rows.map((row) => (
              <KvRowEditor key={row.id} row={row} onChange={(patch) => updateRow(row.id, patch)} onRemove={() => removeRow(row.id)} />
            ))}
            <Button variant="subtle" size="sm" icon={<Plus size={12} />} onClick={addRow}>
              Добавить {kind === "local" ? "переменную" : "заголовок"}
            </Button>
          </div>
        </Field>

        <Switch checked={disabled} onChange={setDisabled} label="Отключён" description="Сервер не будет запускаться при старте pi" />

        {(error || duplicate) && (
          <div className="text-xs text-(--color-danger)">{error || "Сервер с таким именем уже есть"}</div>
        )}
      </div>
    </Modal>
  );
}

function KindButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick(): void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors",
        active
          ? "border-(--color-accent)/50 bg-(--color-accent-soft)/30 text-(--color-accent)"
          : "border-(--color-border) bg-(--color-bg) text-(--color-fg-mute) hover:bg-(--color-bg-mute)",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function KvRowEditor({
  row,
  onChange,
  onRemove,
}: {
  row: KvRow;
  onChange(patch: Partial<KvRow>): void;
  onRemove(): void;
}) {
  if (row.existing) {
    return (
      <div className={clsx("flex items-center gap-1.5", row.markedRemove && "opacity-50")}>
        <span className="h-9 flex-1 min-w-0 flex items-center rounded-lg border border-(--color-border-muted) bg-(--color-bg-mute) px-3 text-xs font-mono truncate">
          {row.key}
        </span>
        <Input
          value={row.value}
          onChange={(e) => onChange({ value: e.target.value })}
          placeholder={row.markedRemove ? "будет удалено" : "оставь пустым, чтобы не менять"}
          disabled={row.markedRemove}
          type="password"
          className="flex-1"
        />
        <Button
          variant={row.markedRemove ? "subtle" : "danger"}
          size="sm"
          icon={<Trash2 size={12} />}
          onClick={() => onChange({ markedRemove: !row.markedRemove })}
          title={row.markedRemove ? "Отменить удаление" : "Удалить ключ"}
        />
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <Input value={row.key} onChange={(e) => onChange({ key: e.target.value })} placeholder="KEY" className="flex-1 font-mono" />
      <Input value={row.value} onChange={(e) => onChange({ value: e.target.value })} placeholder="value" className="flex-1" />
      <Button variant="ghost" size="sm" icon={<Trash2 size={12} />} onClick={onRemove} />
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-(--color-fg)">{label}</span>
        {hint && <span className="text-[11px] text-(--color-fg-dim)">{hint}</span>}
      </div>
      {children}
    </label>
  );
}
