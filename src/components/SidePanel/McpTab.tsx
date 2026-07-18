import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ChevronDown,
  ChevronRight,
  Cloud,
  ExternalLink,
  Pencil,
  Plus,
  RefreshCw,
  Server,
  Trash2,
} from "@/components/ui/icons/compat";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Switch } from "@/components/ui/Switch";
import { useExt } from "@/store/ext";
import { useChat } from "@/store/chat";
import { useMcpStatus } from "@/store/mcpStatus";
import type { McpServerRpcStatus } from "@/rpc/types";
import { McpServerEditorDialog, type McpServerSavePayload } from "./McpServerEditorDialog";

export interface McpServer {
  name: string;
  kind: string;
  disabled: boolean;
  command?: string;
  args: string[];
  url?: string;
  env_keys: string[];
  headers_keys: string[];
}
export interface McpConfig {
  path: string;
  exists: boolean;
  servers: McpServer[];
}

const statusChipProps: Record<McpServerRpcStatus, { tone: "success" | "warning" | "danger" | "neutral"; pulse?: boolean }> = {
  connected: { tone: "success" },
  connecting: { tone: "warning", pulse: true },
  retrying: { tone: "warning", pulse: true },
  error: { tone: "danger" },
  disabled: { tone: "neutral" },
};

export function McpTab() {
  const [cfg, setCfg] = useState<McpConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<McpServer | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const startRpc = useChat((s) => s.startRpc);
  const stopRpc = useChat((s) => s.stopRpc);
  const statuses = useExt((s) => s.statuses);
  const mcpStatus = statuses["mcp"];
  const statusByName = useMcpStatus((s) => s.byName);
  const refreshStatus = useMcpStatus((s) => s.refresh);
  const activeServers = cfg?.servers.filter((s) => !s.disabled).length ?? 0;
  const disabledServers = cfg?.servers.filter((s) => s.disabled).length ?? 0;
  const errorServers = cfg?.servers.filter((s) => {
    const st = statusByName[s.name]?.status;
    return st === "error" || st === "retrying";
  }).length ?? 0;

  const reload = async () => {
    setBusy(true);
    try {
      const c = await invoke<McpConfig>("read_mcp_config");
      setCfg(c);
      await refreshStatus();
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = async (name: string, disabled: boolean) => {
    setPending(name);
    try {
      await invoke("toggle_mcp_server", { args: { name, disabled } });
      await reload();
    } catch (e) {
      alert(String(e));
    } finally {
      setPending(null);
    }
  };

  const restart = async () => {
    setBusy(true);
    try {
      await stopRpc();
      await startRpc();
      const c = await invoke<McpConfig>("read_mcp_config");
      setCfg(c);
      await refreshStatus();
    } finally {
      setBusy(false);
    }
  };

  const save = async (payload: McpServerSavePayload) => {
    await invoke("write_mcp_server", { args: payload });
    await reload();
  };

  const onDelete = async (name: string) => {
    if (!window.confirm(`Удалить MCP-сервер «${name}»?`)) return;
    setPending(name);
    try {
      await invoke("delete_mcp_server", { args: { name } });
      await reload();
    } catch (e) {
      alert(String(e));
    } finally {
      setPending(null);
    }
  };

  const toggleExpanded = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <div className="p-3 space-y-3 min-w-0">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-xs min-w-0 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => void reload()} icon={<RefreshCw size={12} />} disabled={busy}>
            обновить
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void restart()} disabled={busy}>
            перезапустить pi
          </Button>
          {cfg?.path && (
            <Button
              variant="ghost"
              size="sm"
              icon={<ExternalLink size={12} />}
              onClick={() => void invoke("open_in_default_app", { path: cfg.path })}
            >
              файл
            </Button>
          )}
        </div>
        <Button
          variant="primary"
          size="sm"
          icon={<Plus size={12} />}
          onClick={() => {
            setEditingServer(null);
            setEditorOpen(true);
          }}
        >
          добавить сервер
        </Button>
      </div>
      {cfg?.exists && (
        <div className="grid grid-cols-4 gap-1 text-xs">
          <Metric label="total" value={cfg.servers.length} />
          <Metric label="active" value={activeServers} accent />
          <Metric label="disabled" value={disabledServers} />
          <Metric label="ошибки" value={errorServers} danger={errorServers > 0} />
        </div>
      )}
      {!cfg?.exists && (
        <div className="text-xs text-(--color-fg-dim) min-w-0 break-words">
          mcp-config.json не найден
          {cfg?.path && (
            <>
              {" — "}
              <span className="font-mono break-all">{cfg.path}</span>
            </>
          )}
        </div>
      )}
      {cfg?.servers.length === 0 && cfg.exists && (
        <div className="text-xs text-(--color-fg-dim)">Нет серверов в mcp-config.json</div>
      )}
      <div className="space-y-1 min-w-0">
        {cfg?.servers.map((s) => {
          const status = statusByName[s.name];
          const rpcStatus: McpServerRpcStatus = s.disabled ? "disabled" : status?.status ?? "connecting";
          const chipProps = statusChipProps[rpcStatus];
          const tools = status?.tools ?? [];
          const isExpanded = expanded.has(s.name);
          return (
            <div
              key={s.name}
              className={clsx(
                "rounded border min-w-0",
                s.disabled ? "border-(--color-border-muted) opacity-60" : "border-(--color-border)",
              )}
            >
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggleExpanded(s.name)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleExpanded(s.name);
                  }
                }}
                className="w-full flex items-center gap-2 min-w-0 px-2 py-1.5 text-left cursor-pointer hover:bg-(--color-bg-mute)"
              >
                {isExpanded ? <ChevronDown size={11} className="shrink-0 text-(--color-fg-dim)" /> : <ChevronRight size={11} className="shrink-0 text-(--color-fg-dim)" />}
                {s.kind === "remote" ? (
                  <Cloud size={12} className="text-(--color-fg-mute) shrink-0" />
                ) : (
                  <Server size={12} className="text-(--color-fg-mute) shrink-0" />
                )}
                <span className="font-mono text-xs flex-1 min-w-0 truncate">{s.name}</span>
                <Chip size="xs" tone={chipProps.tone} dot pulseDot={chipProps.pulse}>
                  {rpcStatus}
                </Chip>
                <span
                  className="flex items-center gap-1 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button variant="ghost" size="sm" icon={<Pencil size={11} />} onClick={() => { setEditingServer(s); setEditorOpen(true); }} />
                  <Button variant="ghost" size="sm" icon={<Trash2 size={11} />} onClick={() => void onDelete(s.name)} disabled={pending === s.name} />
                  <Switch checked={!s.disabled} onChange={(v) => void toggle(s.name, !v)} disabled={pending === s.name} />
                </span>
              </div>
              <div className="px-2 pb-1.5 min-w-0">
                <div className="text-[11px] text-(--color-fg-dim) mt-0.5 truncate font-mono min-w-0" title={s.kind === "remote" ? s.url : `${s.command ?? ""} ${s.args.join(" ")}`}>
                  {s.kind === "remote" ? s.url : `${s.command ?? ""} ${s.args.join(" ")}`}
                </div>
                {(s.env_keys.length > 0 || s.headers_keys.length > 0) && (
                  <div className="text-[10px] text-(--color-fg-dim) mt-0.5 break-words">
                    {s.env_keys.length > 0 && <span>env: {s.env_keys.join(", ")} </span>}
                    {s.headers_keys.length > 0 && <span>headers: {s.headers_keys.join(", ")}</span>}
                  </div>
                )}
                {status?.error && (
                  <div className="text-[10px] text-(--color-danger) mt-0.5 break-words">{status.error}</div>
                )}
                {isExpanded && (
                  <div className="mt-1.5">
                    {s.disabled ? (
                      <div className="text-[11px] text-(--color-fg-dim)">Сервер отключён — включи, чтобы увидеть инструменты</div>
                    ) : tools.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {tools.map((t) => (
                          <Chip key={t.name} size="xs" variant="mode" mono title={t.description}>
                            {t.name}
                          </Chip>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[11px] text-(--color-fg-dim)">
                        {rpcStatus === "connected" ? "Инструменты не найдены" : "Инструменты появятся после подключения"}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {mcpStatus && (
        <div className="px-2 py-1.5 rounded bg-(--color-bg-mute) text-xs text-(--color-fg-mute) min-w-0 break-words">
          <span className="text-(--color-fg-dim) mr-1">статус:</span>
          {mcpStatus}
        </div>
      )}
      <div className="text-[10px] text-(--color-fg-dim) mt-2">
        После изменения конфигурации нажми «перезапустить pi», чтобы pi подхватил изменения.
      </div>

      <McpServerEditorDialog
        open={editorOpen}
        server={editingServer}
        existingNames={(cfg?.servers ?? []).map((s) => s.name)}
        onClose={() => setEditorOpen(false)}
        onSave={save}
      />
    </div>
  );
}

function Metric({ label, value, accent, danger }: { label: string; value: number; accent?: boolean; danger?: boolean }) {
  return (
    <div className="border border-(--color-border) rounded bg-(--color-bg) px-2 py-1">
      <div className="text-[10px] text-(--color-fg-dim)">{label}</div>
      <div
        className={clsx(
          "font-mono",
          danger ? "text-(--color-danger)" : accent ? "text-(--color-accent)" : "text-(--color-fg-mute)",
        )}
      >
        {value}
      </div>
    </div>
  );
}
