import { useState } from "react";
import { Copy, RefreshCw, Folder, Check } from "@/components/ui/icons/compat";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useChat } from "@/store/chat";
import { t } from "@/i18n/ru";

export function PiMissingCard({ onResolved }: { onResolved: (path: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState(useChat.getState().cliPathOverride ?? "");
  const [copied, setCopied] = useState(false);

  const detect = async () => {
    setBusy(true);
    try {
      const found = await invoke<string | null>("find_pi_binary");
      if (found) {
        onResolved(found);
        return;
      }
    } finally {
      setBusy(false);
    }
  };

  const pickPath = async () => {
    const result = await open({ multiple: false, directory: false, title: "Выбери pi" });
    if (typeof result === "string") setCustom(result);
  };

  const save = () => {
    const c = custom.trim();
    if (!c) return;
    useChat.getState().setCliPathOverride(c);
    onResolved(c);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(t.onboarding.install);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="max-w-md w-full bg-(--color-bg-soft) border border-(--color-border) rounded-lg p-6 space-y-5">
        <div>
          <h1 className="text-base font-semibold mb-1">{t.onboarding.title}</h1>
          <p className="text-sm text-(--color-fg-mute)">{t.onboarding.body}</p>
        </div>
        <div className="flex items-center gap-2 bg-(--color-bg) border border-(--color-border) rounded-md px-3 py-2 font-mono text-xs">
          <span className="flex-1 truncate">{t.onboarding.install}</span>
          <Button variant="ghost" size="sm" onClick={copy} icon={copied ? <Check size={14} /> : <Copy size={14} />} />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="primary" size="md" onClick={detect} icon={<RefreshCw size={14} />}
            disabled={busy}>
            {t.onboarding.retry}
          </Button>
        </div>
        <div className="border-t border-(--color-border) pt-4 space-y-2">
          <div className="text-xs text-(--color-fg-mute)">{t.onboarding.customHint}</div>
          <div className="flex gap-2">
            <Input
              placeholder="/home/.../bin/pi"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
            <Button variant="subtle" size="md" onClick={pickPath} icon={<Folder size={14} />} />
          </div>
          <div className="flex justify-end">
            <Button variant="primary" size="sm" onClick={save} disabled={!custom.trim()}>
              {t.onboarding.save}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
