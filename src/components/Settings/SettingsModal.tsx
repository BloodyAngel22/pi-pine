import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Folder, ExternalLink, Search } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useChat } from "@/store/chat";
import { useTheme } from "@/store/theme";
import { useUiPrefs, FONT_MIN, FONT_MAX, FONT_STEP, CHAT_FONT_MIN, CHAT_FONT_MAX, CHAT_FONT_STEP } from "@/store/uiPrefs";
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
  const chatFontSize = useUiPrefs((s) => s.chatFontSize);
  const setChatFontSize = useUiPrefs((s) => s.setChatFontSize);
  const resetChatFont = useUiPrefs((s) => s.resetChatFont);

  const [pathDraft, setPathDraft] = useState(cliPathOverride ?? "");
  const [cwdDraft, setCwdDraft] = useState(cwd);
  const [modelFilter, setModelFilter] = useState("");
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [agentDir, setAgentDir] = useState<string | null>(null);

  // Image Analysis config state
  const [imgOcrEnabled, setImgOcrEnabled] = useState(true);
  const [imgOcrLang, setImgOcrLang] = useState("eng+rus");
  const [imgCaptioningEnabled, setImgCaptioningEnabled] = useState(false);
  const [imgCaptionBackend, setImgCaptionBackend] = useState("tiny");

  // Image Analysis status (dependencies, cache)
  const [imgStatus, setImgStatus] = useState<{
    tesseract_installed: boolean;
    transformers_installed: boolean;
    cache_size_bytes: number;
    cache_path: string;
    ocr_languages_available: string;
    ollama_available: boolean;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    setPathDraft(cliPathOverride ?? "");
    setCwdDraft(cwd);
    void invoke<AuthStatus>("read_auth_status").then(setAuth);
    void invoke<{ agent_dir?: string }>("detect_environment").then((env) =>
      setAgentDir(env.agent_dir ?? null),
    );
    // Load image analysis config
    void invoke<{
      ocr_enabled: boolean;
      ocr_lang: string;
      captioning_enabled: boolean;
      captioning_backend: string;
    }>("get_analyze_image_config").then((cfg) => {
      if (cfg) {
        setImgOcrEnabled(cfg.ocr_enabled);
        setImgOcrLang(cfg.ocr_lang);
        setImgCaptioningEnabled(cfg.captioning_enabled);
        setImgCaptionBackend(cfg.captioning_backend);
      }
    }).catch(() => {});
    // Load image analysis status — pass pi binary path so Rust can find node_modules
    const piPathForStatus = cliPathOverride || piPath;
    void invoke<{
      tesseract_installed: boolean;
      transformers_installed: boolean;
      cache_size_bytes: number;
      cache_path: string;
      ocr_languages_available: string;
      ollama_available: boolean;
    }>("get_analyze_image_status", { pi_binary_path: piPathForStatus || null }).then(setImgStatus).catch(() => {});
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
    // Save image analysis config
    void invoke("set_analyze_image_config", {
      config: {
        ocr_enabled: imgOcrEnabled,
        ocr_lang: imgOcrLang,
        captioning_enabled: imgCaptioningEnabled,
        captioning_backend: imgCaptionBackend,
        rule_based_classification: true,
        max_image_size_mb: 10,
        ollama_host: "http://localhost:11434",
        ollama_model: "llava",
      },
    }).catch(() => {});
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

        <Section title={t.settings.fontScale}>
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
              {t.settings.reset}
            </Button>
          </div>
          <div className="text-[11px] text-(--color-fg-dim) mt-1">
            {t.settings.fontScaleHint}
          </div>
        </Section>

        <Section title={t.settings.chatFontSize}>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={CHAT_FONT_MIN}
              max={CHAT_FONT_MAX}
              step={CHAT_FONT_STEP}
              value={chatFontSize}
              onChange={(e) => setChatFontSize(parseFloat(e.target.value))}
              className="flex-1 accent-(--color-accent)"
            />
            <span className="text-xs font-mono w-10 text-right text-(--color-fg-mute)">
              {Math.round(chatFontSize * 100)}%
            </span>
            <Button variant="subtle" size="sm" onClick={() => setChatFontSize(chatFontSize - CHAT_FONT_STEP)}>
              −
            </Button>
            <Button variant="subtle" size="sm" onClick={() => setChatFontSize(chatFontSize + CHAT_FONT_STEP)}>
              +
            </Button>
            <Button variant="ghost" size="sm" onClick={resetChatFont}>
              {t.settings.reset}
            </Button>
          </div>
          <div className="text-[11px] text-(--color-fg-dim) mt-1">
            {t.settings.chatFontSizeHint}
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

        <Section title="Image Analysis">
          <div className="space-y-3 text-xs">
            {/* ============================================ */}
            {/* 1. OCR — чтение текста из изображений */}
            {/* ============================================ */}
            <div className="border border-(--color-border) rounded-md p-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold flex items-center gap-1">
                  📝 OCR — распознавание текста
                </span>
                <span className={"inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border " + (imgStatus?.tesseract_installed
                  ? "bg-(--color-success)/10 text-(--color-success) border-(--color-success)/20"
                  : "bg-(--color-warning)/10 text-(--color-warning) border-(--color-warning)/20")}>
                  {imgStatus?.tesseract_installed ? "✅ OK" : "⚠️ not installed"}
                </span>
              </div>
              <div className="text-[10px] text-(--color-fg-dim) leading-relaxed">
                Извлекает текст из картинок. Работает локально, без API.
                Лучше всего читает крупный печатный текст на скриншотах.
                {!imgStatus?.tesseract_installed && (
                  <span className="block mt-1 text-(--color-warning)">
                    Установка npm: <code className="font-mono">npm install tesseract.js</code> в pi-mono-x
                  </span>
                )}
                <span className="block mt-1">
                  Для лучшей производительности установи <span className="font-semibold">нативный Tesseract CLI</span> (2-5× быстрее):
                </span>
                <span className="block mt-1">
                  • Debian/Ubuntu:
                  <code className="font-mono block ml-4">sudo apt install tesseract-ocr tesseract-ocr-rus tesseract-ocr-eng</code>
                  <span className="text-(--color-fg-dim) block ml-4">(eng уже входит в tesseract-ocr, но можно явно)</span>
                </span>
                <span className="block">
                  • Arch:
                  <code className="font-mono block ml-4">sudo pacman -S tesseract tesseract-data-rus tesseract-data-eng</code>
                </span>
                <span className="block">
                  • macOS:
                  <code className="font-mono block ml-4">brew install tesseract</code>
                  <span className="text-(--color-fg-dim) block ml-4">Все языки устанавливаются сразу</span>
                </span>
                <span className="block">
                  • Fedora:
                  <code className="font-mono block ml-4">sudo dnf install tesseract tesseract-langpack-rus</code>
                </span>
                <span className="block mt-1 text-(--color-fg-dim)">
                  После установки проверь: <code className="font-mono">tesseract --list-langs</code> — покажет доступные языки.
                  Язык выбирается в настройках выше (eng+rus по умолчанию).
                </span>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input type="checkbox" checked={imgOcrEnabled}
                    onChange={(e) => setImgOcrEnabled(e.target.checked)}
                    className="accent-(--color-accent) rounded" />
                  <span>включено</span>
                </label>
                <div className="relative">
                  <select value={imgOcrLang}
                    onChange={(e) => setImgOcrLang(e.target.value)}
                    className="appearance-none text-[11px] bg-(--color-bg-soft) border border-(--color-border) rounded px-2 py-0.5 pr-5 text-(--color-fg) cursor-pointer hover:border-(--color-accent)/40 focus:outline-none focus:border-(--color-accent)">
                    <option value="eng">eng</option>
                    <option value="eng+rus">eng+rus</option>
                    <option value="rus">rus</option>
                    <option value="deu">deu</option>
                    <option value="fra">fra</option>
                    <option value="spa">spa</option>
                  </select>
                  <span className="absolute right-1 top-1/2 -translate-y-1/2 text-(--color-fg-dim) pointer-events-none text-[9px]">▼</span>
                </div>
                <span className="text-[10px] text-(--color-fg-dim)">язык</span>
              </div>
              {imgStatus?.ocr_languages_available && imgStatus.ocr_languages_available !== "eng (download on first use)" && (
                <div className="text-[10px] text-(--color-fg-dim)">
                  Кэш языков: {imgStatus.ocr_languages_available}
                </div>
              )}
            </div>

            {/* ============================================ */}
            {/* 2. Captioning — описание содержимого */}
            {/* ============================================ */}
            <div className="border border-(--color-border) rounded-md p-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold flex items-center gap-1">
                  🎯 Captioning — описание изображения
                </span>
                <span className={"inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border " + (imgStatus?.transformers_installed
                  ? "bg-(--color-success)/10 text-(--color-success) border-(--color-success)/20"
                  : "bg-(--color-warning)/10 text-(--color-warning) border-(--color-warning)/20")}>
                  {imgStatus?.transformers_installed ? "✅ OK" : "⚠️ not installed"}
                </span>
              </div>
              <div className="text-[10px] text-(--color-fg-dim) leading-relaxed">
                Описывает содержимое картинки естественным языком ("розовая табличка с белым котом").
                Работает через ML-модель <code className="font-mono">vit-gpt2</code> (~245MB) локально на CPU.
                {!imgStatus?.transformers_installed && (
                  <span className="block mt-1 text-(--color-warning)">
                    Установка: <code className="font-mono">cd pi-mono-x && npm install @huggingface/transformers</code>
                    Модель скачается автоматически при первом вызове (~245MB).
                  </span>
                )}
                {imgStatus?.transformers_installed && imgStatus.cache_size_bytes === 0 && (
                  <span className="block mt-1 text-(--color-warning)">
                    Модель ещё не скачана. Первый вызов скачает ~245MB с HuggingFace Hub.
                  </span>
                )}
                {imgStatus && imgStatus.cache_size_bytes > 0 && (
                  <span className="block mt-1 text-(--color-success)">
                    Модель закеширована: {(imgStatus.cache_size_bytes / 1024 / 1024).toFixed(1)}MB
                  </span>
                )}
              </div>
              <label className="flex items-center gap-1.5 cursor-pointer select-none pt-1">
                <input type="checkbox" checked={imgCaptioningEnabled}
                  onChange={(e) => {
                    setImgCaptioningEnabled(e.target.checked);
                    if (!e.target.checked) setImgCaptionBackend("tiny");
                  }}
                  className="accent-(--color-accent) rounded" />
                <span>включено</span>
              </label>
              {imgCaptioningEnabled && (
                <>
                  <div className="text-[10px] text-(--color-fg-dim)">Бэкенд:</div>
                  <div className="flex flex-wrap gap-1">
                    <Button variant={imgCaptionBackend === "vit-gpt2" ? "primary" : "subtle"} size="sm"
                      disabled={!imgStatus?.transformers_installed}
                      onClick={() => setImgCaptionBackend("vit-gpt2")}>
                      vit-gpt2 🟠 ~3-10s
                    </Button>
                    <Button variant={imgCaptionBackend === "disabled" ? "primary" : "subtle"} size="sm"
                      onClick={() => { setImgCaptioningEnabled(false); setImgCaptionBackend("disabled"); }}>
                      отключить
                    </Button>
                  </div>
                </>
              )}
            </div>

            {/* ============================================ */}
            {/* 3. Colors — определение цветов */}
            {/* ============================================ */}
            <div className="border border-(--color-border) rounded-md p-2 space-y-1.5">
              <div className="flex items-center gap-1 font-semibold">
                🎨 Цветовая палитра
              </div>
              <div className="text-[10px] text-(--color-fg-dim) leading-relaxed">
                Определяет доминантные цвета изображения (red, blue, green, pink, purple, teal и т.д.).
                Работает всегда, без дополнительных зависимостей.
              </div>
            </div>

            {/* ============================================ */}
            {/* 4. Как использовать */}
            {/* ============================================ */}
            <div className="border border-(--color-border) rounded-md p-2 space-y-1">
              <div className="font-semibold flex items-center gap-1">
                💡 Как использовать
              </div>
              <ul className="text-[10px] text-(--color-fg-dim) space-y-1 list-disc list-inside leading-relaxed">
                <li>Вставьте изображение через <kbd className="font-mono px-1 py-0.5 bg-(--color-bg) rounded text-(--color-fg-mute)">Ctrl+V</kbd> — агент автоматически проанализирует его</li>
                <li>Или напишите: <code className="font-mono">analyze_image({'{'}image_path: "/путь/к/файлу.jpg"{'}'})</code></li>
                <li>Для отладки буфера обмена: <code className="font-mono">/clipboard</code></li>
              </ul>
            </div>
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
