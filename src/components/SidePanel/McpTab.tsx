import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ExternalLink, RefreshCw, Server, Cloud } from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { useExt } from "@/store/ext";
import { useChat } from "@/store/chat";

interface McpServer {
  name: string;
  kind: string;
  disabled: boolean;
  command?: string;
  args: string[];
  url?: string;
  env_keys: string[];
  headers_keys: string[];
}
interface McpConfig {
  path: string;
  exists: boolean;
  servers: McpServer[];
}

export function McpTab() {
  const [cfg, setCfg] = useState<McpConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const startRpc = useChat((s) => s.startRpc);
  const stopRpc = useChat((s) => s.stopRpc);
  const statuses = useExt((s) => s.statuses);
  const mcpStatus = statuses["mcp"];

  const reload = async () => {
    setBusy(true);
    try {
      const c = await invoke<McpConfig>("read_mcp_config");
      setCfg(c);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void reload();
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
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center gap-2 text-xs">
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
      {mcpStatus && (
        <div className="px-2 py-1.5 rounded bg-(--color-bg-mute) text-xs text-(--color-fg-mute)">
          <span className="text-(--color-fg-dim) mr-1">статус:</span>
          {mcpStatus}
        </div>
      )}
      {!cfg?.exists && (
        <div className="text-xs text-(--color-fg-dim)">
          mcp-config.json не найден
          {cfg?.path && (
            <>
              {" — "}
              <span className="font-mono">{cfg.path}</span>
            </>
          )}
        </div>
      )}
      {cfg?.servers.length === 0 && cfg.exists && (
        <div className="text-xs text-(--color-fg-dim)">Нет серверов в mcp-config.json</div>
      )}
      <div className="space-y-1">
        {cfg?.servers.map((s) => (
          <div
            key={s.name}
            className={clsx(
              "px-2 py-1.5 rounded border",
              s.disabled ? "border-(--color-border-muted) opacity-60" : "border-(--color-border)",
            )}
          >
            <div className="flex items-center gap-2">
              {s.kind === "remote" ? (
                <Cloud size={12} className="text-(--color-fg-mute)" />
              ) : (
                <Server size={12} className="text-(--color-fg-mute)" />
              )}
              <span className="font-mono text-xs flex-1 truncate">{s.name}</span>
              <span className="text-[10px] text-(--color-fg-dim) uppercase">{s.kind}</span>
              <Toggle
                value={!s.disabled}
                onChange={(v) => void toggle(s.name, !v)}
                disabled={pending === s.name}
              />
            </div>
            <div className="text-[11px] text-(--color-fg-dim) mt-0.5 truncate font-mono">
              {s.kind === "remote" ? s.url : `${s.command ?? ""} ${s.args.join(" ")}`}
            </div>
            {(s.env_keys.length > 0 || s.headers_keys.length > 0) && (
              <div className="text-[10px] text-(--color-fg-dim) mt-0.5">
                {s.env_keys.length > 0 && <span>env: {s.env_keys.join(", ")} </span>}
                {s.headers_keys.length > 0 && <span>headers: {s.headers_keys.join(", ")}</span>}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="text-[10px] text-(--color-fg-dim) mt-2">
        После переключения нажми «перезапустить pi», чтобы pi подхватил конфигурацию.
      </div>
    </div>
  );
}

function Toggle({
  value,
  onChange,
  disabled,
}: {
  value: boolean;
  onChange(v: boolean): void;
  disabled?: boolean;
}) {
  // 28x16 контейнер, 12x12 thumb, 2px паддинг с обеих сторон.
  // OFF: thumb at left:2 → translate-x-0
  // ON:  thumb at left:14 → translate-x-3 (12px)
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      aria-pressed={value}
      className={clsx(
        "shrink-0 w-7 h-4 rounded-full relative transition-colors border",
        value
          ? "bg-(--color-success)/70 border-(--color-success)/70"
          : "bg-(--color-bg-mute) border-(--color-border)",
        disabled && "opacity-50",
      )}
    >
      <span
        className={clsx(
          "absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform",
          value ? "translate-x-3" : "translate-x-0",
        )}
      />
    </button>
  );
}
