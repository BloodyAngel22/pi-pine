import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Folder, ExternalLink, Search } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useChat } from "@/store/chat";
import { useTheme } from "@/store/theme";
import { useUiPrefs, FONT_MIN, FONT_MAX, FONT_STEP } from "@/store/uiPrefs";
import type { ThinkingLevel } from "@/rpc/types";
import { t } from "@/i18n/ru";

interface AuthStatus {
  auth_file?: string;
  auth_file_exists: boolean;
  providers: { provider: string; kind: string }[];
}

const THINKING_LEVELS: ThinkingLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
];

export function SettingsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const cliPathOverride = useChat((s) => s.cliPathOverride);
  const piPath = useChat((s) => s.piPath);
  const cwd = useChat((s) => s.cwd);
  const setCliPathOverride = useChat((s) => s.setCliPathOverride);
  const setCwd = useChat((s) => s.setCwd);
  const agentState = useChat((s) => s.agentState);
  const availableModels = useChat((s) => s.availableModels);
  const switchModel = useChat((s) => s.switchModel);
  const setThinking = useChat((s) => s.setThinking);
  const startRpc = useChat((s) => s.startRpc);
  const stopRpc = useChat((s) => s.stopRpc);

  const themeAvailable = useTheme((s) => s.available);
  const themeCurrent = useTheme((s) => s.current);
  const setTheme = useTheme((s) => s.setTheme);

  const fontScale = useUiPrefs((s) => s.fontScale);
  const setFontScale = useUiPrefs((s) => s.setFontScale);
  const resetFont = useUiPrefs((s) => s.resetFont);

  const [pathDraft, setPathDraft] = useState(cliPathOverride ?? "");
  const [cwdDraft, setCwdDraft] = useState(cwd);
  const [modelFilter, setModelFilter] = useState("");
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [agentDir, setAgentDir] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPathDraft(cliPathOverride ?? "");
    setCwdDraft(cwd);
    void invoke<AuthStatus>("read_auth_status").then(setAuth);
    void invoke<{ agent_dir?: string }>("detect_environment").then((env) =>
      setAgentDir(env.agent_dir ?? null),
    );
  }, [open, cliPathOverride, cwd]);

  const detectPi = async () => {
    const found = await invoke<string | null>("find_pi_binary");
    if (found) setPathDraft(found);
  };

  const pickFile = async () => {
    const r = await openDialog({ multiple: false, directory: false });
    if (typeof r === "string") setPathDraft(r);
  };

  const pickDir = async () => {
    const r = await openDialog({ multiple: false, directory: true });
    if (typeof r === "string") setCwdDraft(r);
  };

  const save = async () => {
    const cliChanged = pathDraft !== (cliPathOverride ?? "");
    const cwdChanged = cwdDraft !== cwd;
    setCliPathOverride(pathDraft || null);
    if (cwdChanged) setCwd(cwdDraft);
    if (cliChanged || cwdChanged) {
      await stopRpc();
      await startRpc();
    }
    onClose();
  };

  const filteredModels = availableModels.filter((m) => {
    if (!modelFilter) return true;
    const q = modelFilter.toLowerCase();
    return (
      m.id.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q)
    );
  });

  const currentModelKey = agentState?.model
    ? `${agentState.model.provider}/${agentState.model.id}`
    : "";

  return (
    <Modal
      open={open}
      title={t.settings.title}
      onClose={onClose}
      width="640px"
      footer={
        <>
          <Button variant="ghost" size="md" onClick={onClose}>
            {t.settings.cancel}
          </Button>
          <Button variant="primary" size="md" onClick={save}>
            {t.settings.save}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Section title={t.settings.cliPath}>
          <div className="flex gap-2">
            <Input
              placeholder="auto"
              value={pathDraft}
              onChange={(e) => setPathDraft(e.target.value)}
            />
            <Button variant="subtle" size="md" onClick={detectPi} icon={<Search size={14} />}>
              {t.settings.cliPathDetect}
            </Button>
            <Button variant="subtle" size="md" onClick={pickFile} icon={<Folder size={14} />} />
          </div>
          <div className="text-[11px] text-(--color-fg-dim) mt-1">
            {t.settings.cliPathHint}
            {piPath && (
              <>
                {" · "}
                текущий: <span className="font-mono">{piPath}</span>
              </>
            )}
          </div>
        </Section>

        <Section title={t.settings.cwd}>
          <div className="flex gap-2">
            <Input
              value={cwdDraft}
              onChange={(e) => setCwdDraft(e.target.value)}
            />
            <Button variant="subtle" size="md" onClick={pickDir} icon={<Folder size={14} />}>
              {t.settings.pickCwd}
            </Button>
          </div>
        </Section>

        <Section title={t.settings.model}>
          <div className="space-y-2">
            <Input
              placeholder="поиск…"
              value={modelFilter}
              onChange={(e) => setModelFilter(e.target.value)}
            />
            <div className="max-h-56 overflow-y-auto border border-(--color-border) rounded-md">
              {filteredModels.length === 0 && (
                <div className="px-3 py-2 text-xs text-(--color-fg-dim)">
                  {t.settings.none}
                </div>
              )}
              {filteredModels.map((m) => {
                const key = `${m.provider}/${m.id}`;
                const active = key === currentModelKey;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => void switchModel(m.provider, m.id)}
                    className={
                      "w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-(--color-bg-mute) " +
                      (active ? "bg-(--color-accent-soft)/30" : "")
                    }
                  >
                    <span className="font-mono text-(--color-accent) w-32 truncate">
                      {m.provider}
                    </span>
                    <span className="font-mono flex-1 truncate">{m.id}</span>
                    {m.contextWindow && (
                      <span className="text-(--color-fg-dim)">
                        {Math.round(m.contextWindow / 1024)}k
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </Section>

        <Section title="Размер шрифта">
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={FONT_MIN}
              max={FONT_MAX}
              step={FONT_STEP}
              value={fontScale}
              onChange={(e) => setFontScale(parseFloat(e.target.value))}
              className="flex-1 accent-(--color-accent)"
            />
            <span className="text-xs font-mono w-10 text-right text-(--color-fg-mute)">
              {Math.round(fontScale * 100)}%
            </span>
            <Button variant="subtle" size="sm" onClick={() => setFontScale(fontScale - FONT_STEP)}>
              −
            </Button>
            <Button variant="subtle" size="sm" onClick={() => setFontScale(fontScale + FONT_STEP)}>
              +
            </Button>
            <Button variant="ghost" size="sm" onClick={resetFont}>
              Сброс
            </Button>
          </div>
          <div className="text-[11px] text-(--color-fg-dim) mt-1">
            Масштабирует весь интерфейс.
          </div>
        </Section>

        <Section title="Тема">
          <div className="flex flex-wrap gap-1.5">
            {themeAvailable.map((th) => (
              <Button
                key={th.name}
                variant={themeCurrent === th.name ? "primary" : "subtle"}
                size="sm"
                onClick={() => void setTheme(th.name)}
              >
                {th.name}
                {th.source === "user" && (
                  <span className="ml-1 text-(--color-fg-dim)">·user</span>
                )}
              </Button>
            ))}
          </div>
        </Section>

        <Section title={t.settings.thinking}>
          <div className="flex flex-wrap gap-1.5">
            {THINKING_LEVELS.map((lvl) => {
              const active = agentState?.thinkingLevel === lvl;
              return (
                <Button
                  key={lvl}
                  variant={active ? "primary" : "subtle"}
                  size="sm"
                  onClick={() => void setThinking(lvl)}
                >
                  {lvl}
                </Button>
              );
            })}
          </div>
        </Section>

        <Section title={t.settings.auth}>
          {auth ? (
            <div className="space-y-1 text-xs">
              <div className="text-(--color-fg-mute)">
                {t.settings.authFile}:{" "}
                <span className="font-mono">
                  {auth.auth_file ?? t.settings.none}
                </span>{" "}
                {auth.auth_file_exists ? "✓" : "✗"}
              </div>
              <div>
                {t.settings.authProviders}:{" "}
                {auth.providers.length > 0
                  ? auth.providers
                      .map((p) => `${p.provider} (${p.kind})`)
                      .join(", ")
                  : t.settings.none}
              </div>
              {agentDir && (
                <div className="pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<ExternalLink size={12} />}
                    onClick={() => void invoke("open_in_default_app", { path: agentDir })}
                  >
                    {t.settings.openAgentDir}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-(--color-fg-dim)">…</div>
          )}
        </Section>
      </div>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider font-semibold text-(--color-fg-mute) mb-1.5">
        {title}
      </div>
      {children}
    </div>
  );
}
