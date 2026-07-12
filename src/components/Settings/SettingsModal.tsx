import { useEffect, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import clsx from "clsx";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { ExternalLink, Folder, Search } from "@/components/ui/icons/compat";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Switch } from "@/components/ui/Switch";
import { useChat } from "@/store/chat";
import { useTheme } from "@/store/theme";
import {
  CHAT_FONT_MAX,
  CHAT_FONT_MIN,
  CHAT_FONT_STEP,
  DEEP_RESEARCH_MODES,
  DIFF_FONT_MAX,
  DIFF_FONT_MIN,
  DIFF_FONT_STEP,
  FONT_MAX,
  FONT_MIN,
  FONT_STEP,
  type DeepResearchMode,
  useUiPrefs,
} from "@/store/uiPrefs";
import type { ThinkingLevel } from "@/rpc/types";
import { t } from "@/i18n/ru";
import { SettingsNav, type SettingsSectionId } from "./SettingsNav";
import { Hint, RangeControl, Section, SettingsStack } from "./SettingsSections";
import { Select } from "@/components/ui/Select";

interface AuthStatus {
  auth_file?: string;
  auth_file_exists: boolean;
  providers: { provider: string; kind: string }[];
}

interface ImageStatus {
  tesseract_installed: boolean;
  transformers_installed: boolean;
  cache_size_bytes: number;
  cache_path: string;
  ocr_languages_available: string;
  ollama_available: boolean;
}

interface TranscriptionConfig {
  base_url: string;
  api_key: string;
  model: string;
}

interface AudioModelInfo {
  id: string;
  name: string;
}

interface TestConnectionResult {
  reachable: boolean;
  latency_ms?: number;
  error?: string;
}

const THINKING_LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const cliPathOverride = useChat((s) => s.cliPathOverride);
  const piPath = useChat((s) => s.piPath);
  const cwd = useChat((s) => s.cwd);
  const setCliPathOverride = useChat((s) => s.setCliPathOverride);
  const setCwd = useChat((s) => s.setCwd);
  const agentState = useChat((s) => s.agentState);
  const availableModels = useChat((s) => s.availableModels);
  const switchModel = useChat((s) => s.switchModel);
  const setThinking = useChat((s) => s.setThinking);
  const setAutoCompaction = useChat((s) => s.setAutoCompaction);
  const setContextPruning = useChat((s) => s.setContextPruning);
  const contextPruningStats = useChat((s) => s.contextPruningStats);
  const setFileManifest = useChat((s) => s.setFileManifest);
  const setNotificationSoundEnabled = useChat((s) => s.setNotificationSoundEnabled);
  const setNotificationSoundPath = useChat((s) => s.setNotificationSoundPath);
  const setSubagentConcurrency = useChat((s) => s.setSubagentConcurrency);
  const setSubagentTimeout = useChat((s) => s.setSubagentTimeout);
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
  const diffFontSize = useUiPrefs((s) => s.diffFontSize);
  const setDiffFontSize = useUiPrefs((s) => s.setDiffFontSize);
  const resetDiffFont = useUiPrefs((s) => s.resetDiffFont);
  const deepResearchMode = useUiPrefs((s) => s.deepResearchMode);
  const setDeepResearchMode = useUiPrefs((s) => s.setDeepResearchMode);
  const notificationsEnabled = useUiPrefs((s) => s.notificationsEnabled);
  const setNotificationsEnabled = useUiPrefs((s) => s.setNotificationsEnabled);

  const [section, setSection] = useState<SettingsSectionId>("environment");
  const [pathDraft, setPathDraft] = useState(cliPathOverride ?? "");
  const [cwdDraft, setCwdDraft] = useState(cwd);
  const [modelFilter, setModelFilter] = useState("");
  const [deepResearchModeDraft, setDeepResearchModeDraft] = useState<DeepResearchMode>(deepResearchMode);
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [agentDir, setAgentDir] = useState<string | null>(null);

  const [imgOcrEnabled, setImgOcrEnabled] = useState(true);
  const [imgOcrLang, setImgOcrLang] = useState("eng+rus");
  const [imgCaptioningEnabled, setImgCaptioningEnabled] = useState(false);
  const [imgCaptionBackend, setImgCaptionBackend] = useState("tiny");
  const [imgStatus, setImgStatus] = useState<ImageStatus | null>(null);

  const [voiceBaseUrl, setVoiceBaseUrl] = useState("http://localhost:20128");
  const [voiceApiKey, setVoiceApiKey] = useState("");
  const [voiceApiKeyVisible, setVoiceApiKeyVisible] = useState(false);
  const [voiceModel, setVoiceModel] = useState("");
  const [voiceModelOptions, setVoiceModelOptions] = useState<AudioModelInfo[]>([]);
  const [voiceTesting, setVoiceTesting] = useState(false);
  const [voiceTestResult, setVoiceTestResult] = useState<TestConnectionResult | null>(null);

  const [rpcLogEnabled, setRpcLogEnabled] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPathDraft(cliPathOverride ?? "");
    setCwdDraft(cwd);
    setDeepResearchModeDraft(deepResearchMode);
    void invoke<AuthStatus>("read_auth_status").then(setAuth);
    void invoke<{ agent_dir?: string }>("detect_environment").then((env) => setAgentDir(env.agent_dir ?? null));
    void invoke<{
      ocr_enabled: boolean;
      ocr_lang: string;
      captioning_enabled: boolean;
      captioning_backend: string;
    }>("get_analyze_image_config").then((cfg) => {
      setImgOcrEnabled(cfg.ocr_enabled);
      setImgOcrLang(cfg.ocr_lang);
      setImgCaptioningEnabled(cfg.captioning_enabled);
      setImgCaptionBackend(cfg.captioning_backend);
    }).catch(() => {});
    void invoke<ImageStatus>("get_analyze_image_status", { pi_binary_path: cliPathOverride || piPath || null }).then(setImgStatus).catch(() => {});
    void invoke<TranscriptionConfig>("get_transcription_config").then((cfg) => {
      setVoiceBaseUrl(cfg.base_url);
      setVoiceApiKey(cfg.api_key);
      setVoiceModel(cfg.model);
    }).catch(() => {});
    void invoke<{ enabled: boolean }>("get_rpc_log_config").then((cfg) => {
      setRpcLogEnabled(cfg.enabled);
    }).catch(() => {});
    setVoiceTestResult(null);
  }, [open, cliPathOverride, cwd, deepResearchMode, piPath]);

  const testSttConnection = async () => {
    setVoiceTesting(true);
    setVoiceTestResult(null);
    setVoiceModelOptions([]);
    try {
      const conn = await invoke<TestConnectionResult>("test_stt_connection", { baseUrl: voiceBaseUrl });
      setVoiceTestResult(conn);
      if (conn.reachable) {
        const models = await invoke<AudioModelInfo[]>("list_transcription_models", {
          baseUrl: voiceBaseUrl,
          apiKey: voiceApiKey,
        }).catch((e) => {
          setVoiceTestResult({ reachable: true, error: typeof e === "string" ? e : String(e) });
          return [] as AudioModelInfo[];
        });
        setVoiceModelOptions(models);
        if (models.length > 0 && !models.some((m) => m.id === voiceModel)) {
          setVoiceModel(models[0].id);
        }
      }
    } finally {
      setVoiceTesting(false);
    }
  };

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

  const pickNotificationSound = async () => {
    const r = await openDialog({ multiple: false, directory: false });
    if (typeof r === "string") void setNotificationSoundPath(r);
  };

  const save = async () => {
    const cliChanged = pathDraft !== (cliPathOverride ?? "");
    const cwdChanged = cwdDraft !== cwd;
    const deepResearchModeChanged = deepResearchModeDraft !== deepResearchMode;
    setCliPathOverride(pathDraft || null);
    if (cwdChanged) setCwd(cwdDraft);
    if (deepResearchModeChanged) setDeepResearchMode(deepResearchModeDraft);
    if (cliChanged || cwdChanged || deepResearchModeChanged) {
      await stopRpc();
      await startRpc();
    }
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
    void invoke("set_transcription_config", {
      config: {
        base_url: voiceBaseUrl,
        api_key: voiceApiKey,
        model: voiceModel,
      },
    }).catch(() => {});
    void invoke("set_rpc_log_config", {
      config: { enabled: rpcLogEnabled },
    }).catch(() => {});
    onClose();
  };

  const filteredModels = availableModels.filter((m) => {
    const q = modelFilter.toLowerCase();
    return !q || m.id.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q);
  });
  const currentModelKey = agentState?.model ? `${agentState.model.provider}/${agentState.model.id}` : "";

  return (
    <Modal
      open={open}
      title={t.settings.title}
      onClose={onClose}
      width="780px"
      footer={
        <>
          <Button variant="ghost" size="md" onClick={onClose}>{t.settings.cancel}</Button>
          <Button variant="primary" size="md" onClick={save}>{t.settings.save}</Button>
        </>
      }
    >
      <Tabs.Root value={section} onValueChange={(value) => setSection(value as SettingsSectionId)} className="-m-4 flex h-[560px] min-h-0">
        <SettingsNav active={section} />
        <div className="min-w-0 flex-1 overflow-y-auto p-5">
          <Tabs.Content value="environment" className="outline-none">
            <SettingsStack>
              <Section title={t.settings.cliPath}>
                <div className="flex gap-2">
                  <Input placeholder="auto" value={pathDraft} onChange={(e) => setPathDraft(e.target.value)} />
                  <Button variant="subtle" size="md" onClick={detectPi} icon={<Search size={14} />}>{t.settings.cliPathDetect}</Button>
                  <Button variant="subtle" size="md" onClick={pickFile} icon={<Folder size={14} />} aria-label="Выбрать файл" />
                </div>
                <Hint>{t.settings.cliPathHint}{piPath ? <> · текущий: <span className="font-mono">{piPath}</span></> : null}</Hint>
              </Section>

              <Section title={t.settings.cwd}>
                <div className="flex gap-2">
                  <Input value={cwdDraft} onChange={(e) => setCwdDraft(e.target.value)} />
                  <Button variant="subtle" size="md" onClick={pickDir} icon={<Folder size={14} />}>{t.settings.pickCwd}</Button>
                </div>
              </Section>

              <Section title="Deep Research">
                <SegmentedControl
                  ariaLabel="Deep Research default mode"
                  value={deepResearchModeDraft}
                  options={DEEP_RESEARCH_MODES.map((mode) => ({ value: mode, label: mode }))}
                  onChange={(mode) => setDeepResearchModeDraft(mode)}
                />
                <Hint>quick ≈ 5m/snippets · balanced ≈ 10m/1 page · deep ≈ 20m/2 pages</Hint>
              </Section>

              <Section title="Логи RPC">
                <Switch
                  checked={rpcLogEnabled}
                  onChange={setRpcLogEnabled}
                  label="Логировать RPC-трафик в ~/.pi-pine/logs/"
                  description="Для диагностики падений pi. Применяется при следующем запуске RPC."
                />
              </Section>
            </SettingsStack>
          </Tabs.Content>

          <Tabs.Content value="model" className="outline-none">
            <SettingsStack>
              <Section title={t.settings.model}>
                <Input placeholder="поиск…" value={modelFilter} onChange={(e) => setModelFilter(e.target.value)} />
                <div className="mt-2 max-h-[360px] overflow-y-auto rounded-xl border border-(--color-border)">
                  {filteredModels.length === 0 && <div className="px-3 py-2 text-xs text-(--color-fg-dim)">{t.settings.none}</div>}
                  {filteredModels.map((m) => {
                    const key = `${m.provider}/${m.id}`;
                    const active = key === currentModelKey;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => void switchModel(m.provider, m.id)}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-(--color-bg-mute) ${active ? "bg-(--color-accent-soft)" : ""}`}
                      >
                        <span className="w-32 truncate font-mono text-(--color-accent)">{m.provider}</span>
                        <span className="min-w-0 flex-1 truncate font-mono">{m.id}</span>
                        {m.contextWindow && <span className="text-(--color-fg-dim)">{Math.round(m.contextWindow / 1024)}k</span>}
                      </button>
                    );
                  })}
                </div>
              </Section>

              <Section title={t.settings.thinking}>
                <SegmentedControl
                  ariaLabel="Thinking level"
                  value={agentState?.thinkingLevel ?? "off"}
                  options={THINKING_LEVELS.map((lvl) => ({ value: lvl, label: lvl }))}
                  onChange={(lvl) => void setThinking(lvl)}
                />
              </Section>

              <Section title="Управление контекстом">
                <Switch
                  checked={agentState?.autoCompactionEnabled ?? true}
                  onChange={(v) => void setAutoCompaction(v)}
                  label="Автоматическое сжатие контекста"
                  description="Суммаризировать старую историю через LLM, когда контекст почти заполнен."
                />
                <Switch
                  checked={agentState?.contextPruningEnabled ?? true}
                  onChange={(v) => void setContextPruning(v)}
                  label="Очистка устаревших файлов"
                  description="Без обращения к LLM заменять устаревшие результаты чтения файлов (повторно прочитанные или изменённые) короткой заглушкой перед каждым запросом к модели."
                />
                {contextPruningStats.totalPrunedCount > 0 && (
                  <Hint>
                    Очищено результатов: {contextPruningStats.totalPrunedCount}, освобождено ≈{contextPruningStats.totalTokensFreed} токенов за эту сессию.
                  </Hint>
                )}
                <Switch
                  checked={agentState?.fileManifestEnabled ?? true}
                  onChange={(v) => void setFileManifest(v)}
                  label="Манифест файлов сессии"
                  description="Без обращения к LLM перед каждым запросом к модели напоминать список прочитанных/изменённых файлов — даже если их содержимое уже вычищено очисткой контекста."
                />
              </Section>

              <Section title="Sub-agents">
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm">Параллельных задач одновременно</span>
                    <span className="font-mono text-xs text-(--color-fg-mute)">{agentState?.subagentConcurrencyLimit ?? 3}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="subtle"
                      size="sm"
                      onClick={() => void setSubagentConcurrency(Math.max(1, (agentState?.subagentConcurrencyLimit ?? 3) - 1))}
                    >
                      −
                    </Button>
                    <Button
                      variant="subtle"
                      size="sm"
                      onClick={() => void setSubagentConcurrency(Math.min(10, (agentState?.subagentConcurrencyLimit ?? 3) + 1))}
                    >
                      +
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void setSubagentConcurrency(3)}>
                      Сброс
                    </Button>
                  </div>
                </div>
                <div className="mt-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm">Таймаут задачи, мин</span>
                    <span className="font-mono text-xs text-(--color-fg-mute)">
                      {Math.round((agentState?.subagentDefaultTimeoutMs ?? 5 * 60 * 1000) / 60000)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="subtle"
                      size="sm"
                      onClick={() =>
                        void setSubagentTimeout(
                          Math.max(0.5, Math.round((agentState?.subagentDefaultTimeoutMs ?? 5 * 60 * 1000) / 60000) - 1) * 60000,
                        )
                      }
                    >
                      −
                    </Button>
                    <Button
                      variant="subtle"
                      size="sm"
                      onClick={() =>
                        void setSubagentTimeout(
                          Math.min(30, Math.round((agentState?.subagentDefaultTimeoutMs ?? 5 * 60 * 1000) / 60000) + 1) * 60000,
                        )
                      }
                    >
                      +
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void setSubagentTimeout(5 * 60 * 1000)}>
                      Сброс
                    </Button>
                  </div>
                </div>
                <Hint>Лимит параллельных под-агентов (task tool) и таймаут одной задачи по умолчанию.</Hint>
              </Section>
            </SettingsStack>
          </Tabs.Content>

          <Tabs.Content value="interface" className="outline-none">
            <SettingsStack>
              <Section title={t.settings.fontScale}>
                <RangeControl value={fontScale} min={FONT_MIN} max={FONT_MAX} step={FONT_STEP} onChange={setFontScale} onReset={resetFont} resetLabel={t.settings.reset} />
                <Hint>{t.settings.fontScaleHint}</Hint>
              </Section>
              <Section title={t.settings.chatFontSize}>
                <RangeControl value={chatFontSize} min={CHAT_FONT_MIN} max={CHAT_FONT_MAX} step={CHAT_FONT_STEP} onChange={setChatFontSize} onReset={resetChatFont} resetLabel={t.settings.reset} />
                <Hint>{t.settings.chatFontSizeHint}</Hint>
              </Section>
              <Section title={t.settings.diffFontSize}>
                <RangeControl value={diffFontSize} min={DIFF_FONT_MIN} max={DIFF_FONT_MAX} step={DIFF_FONT_STEP} onChange={setDiffFontSize} onReset={resetDiffFont} resetLabel={t.settings.reset} />
                <Hint>{t.settings.diffFontSizeHint}</Hint>
              </Section>
              <Section title="Тема">
                <div className="flex flex-wrap gap-1.5">
                  {themeAvailable.map((th) => (
                    <Button key={th.name} variant={themeCurrent === th.name ? "primary" : "subtle"} size="sm" onClick={() => void setTheme(th.name)}>
                      {th.name}{th.source === "user" && <span className="ml-1 opacity-70">·user</span>}
                    </Button>
                  ))}
                </div>
              </Section>
              <Section title="Уведомления">
                <Switch
                  checked={notificationsEnabled}
                  onChange={setNotificationsEnabled}
                  label="Системные уведомления"
                  description="Уведомлять, когда агент ждёт ответа или завершил ход, если окно не в фокусе."
                />
                <Switch
                  checked={agentState?.notificationSoundEnabled ?? true}
                  onChange={(v) => void setNotificationSoundEnabled(v)}
                  label="Звук уведомления"
                  description="Звуковой сигнал при завершении ответа агента, запросе разрешения и вопросе агента (ask_user)."
                  className="mt-3"
                />
                <div className="mt-3 flex items-center gap-2">
                  <Input value={agentState?.notificationSoundPath ?? ""} readOnly placeholder="Звук по умолчанию" />
                  <Button variant="subtle" size="md" onClick={pickNotificationSound} icon={<Folder size={14} />} aria-label="Выбрать файл звука" />
                  {agentState?.notificationSoundPath && (
                    <Button variant="ghost" size="md" onClick={() => void setNotificationSoundPath(undefined)}>Сбросить</Button>
                  )}
                </div>
              </Section>
            </SettingsStack>
          </Tabs.Content>

          <Tabs.Content value="images" className="outline-none">
            <SettingsStack>
              <Section title="OCR">
                <Switch checked={imgOcrEnabled} onChange={setImgOcrEnabled} label="Распознавать текст" description={imgStatus?.tesseract_installed ? "Tesseract доступен" : "Tesseract не найден, будет использован JS fallback при наличии"} />
                <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-(--color-border-muted) bg-(--color-bg-mute)/45 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-(--color-fg)">Язык OCR</div>
                    <div className="text-[11px] leading-snug text-(--color-fg-dim)">Используется для распознавания текста на изображениях.</div>
                  </div>
                  <Select
                    value={imgOcrLang}
                    onValueChange={setImgOcrLang}
                    ariaLabel="OCR language"
                    className="h-8 w-[132px] shrink-0 text-xs"
                    options={[
                      { value: "eng", label: "eng" },
                      { value: "eng+rus", label: "eng+rus" },
                      { value: "rus", label: "rus" },
                      { value: "deu", label: "deu" },
                      { value: "fra", label: "fra" },
                      { value: "spa", label: "spa" },
                    ]}
                  />
                </div>
              </Section>
              <Section title="Captioning">
                <Switch checked={imgCaptioningEnabled} onChange={setImgCaptioningEnabled} label="Описывать изображение" description={imgStatus?.transformers_installed ? "Transformers доступны" : "@huggingface/transformers не найден"} />
                {imgCaptioningEnabled && (
                  <div className="mt-3 flex gap-1.5">
                    <Button variant={imgCaptionBackend === "vit-gpt2" ? "primary" : "subtle"} size="sm" disabled={!imgStatus?.transformers_installed} onClick={() => setImgCaptionBackend("vit-gpt2")}>vit-gpt2</Button>
                    <Button variant={imgCaptionBackend === "disabled" ? "primary" : "subtle"} size="sm" onClick={() => { setImgCaptioningEnabled(false); setImgCaptionBackend("disabled"); }}>disabled</Button>
                  </div>
                )}
                {imgStatus && <Hint>Cache: {(imgStatus.cache_size_bytes / 1024 / 1024).toFixed(1)}MB · {imgStatus.cache_path}</Hint>}
              </Section>
            </SettingsStack>
          </Tabs.Content>

          <Tabs.Content value="voice" className="outline-none">
            <SettingsStack>
              <Section title={t.voice.settingsSection}>
                <div className="space-y-2">
                  <Hint>{t.voice.settingsSectionHint}</Hint>
                  <div>
                    <div className="mb-1 text-xs font-medium text-(--color-fg)">{t.voice.baseUrlLabel}</div>
                    <Input
                      value={voiceBaseUrl}
                      onChange={(e) => setVoiceBaseUrl(e.target.value)}
                      placeholder="http://localhost:20128"
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-medium text-(--color-fg)">{t.voice.apiKeyLabel}</div>
                    <div className="flex gap-2">
                      <Input
                        type={voiceApiKeyVisible ? "text" : "password"}
                        value={voiceApiKey}
                        onChange={(e) => setVoiceApiKey(e.target.value)}
                        placeholder="sk-..."
                        className="flex-1"
                      />
                      <Button variant="subtle" size="md" onClick={() => setVoiceApiKeyVisible((v) => !v)}>
                        {voiceApiKeyVisible ? "Скрыть" : "Показать"}
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Button variant="subtle" size="sm" onClick={() => void testSttConnection()} disabled={voiceTesting}>
                      {voiceTesting ? t.voice.testing : t.voice.testConnection}
                    </Button>
                    {voiceTestResult && (
                      <span className={clsx("text-xs", voiceTestResult.reachable ? "text-(--color-success)" : "text-(--color-danger)")}>
                        {voiceTestResult.reachable ? t.voice.reachable : (voiceTestResult.error ?? t.voice.unreachable)}
                      </span>
                    )}
                  </div>
                </div>
              </Section>
              <Section title={t.voice.modelSectionTitle}>
                <Input
                  value={voiceModel}
                  onChange={(e) => setVoiceModel(e.target.value)}
                  placeholder={t.voice.modelPlaceholder}
                  list="voice-model-suggestions"
                />
                {voiceModelOptions.length > 0 && (
                  <datalist id="voice-model-suggestions">
                    {voiceModelOptions.map((m) => (
                      <option key={m.id} value={m.id} />
                    ))}
                  </datalist>
                )}
                <Hint>{t.voice.modelSectionHint}</Hint>
                {voiceTestResult?.reachable && voiceModelOptions.length === 0 && (
                  <Hint>{t.voice.noModelsFound}</Hint>
                )}
              </Section>
            </SettingsStack>
          </Tabs.Content>

          <Tabs.Content value="auth" className="outline-none">
            <SettingsStack>
              <Section title={t.settings.auth}>
                {auth ? (
                  <div className="space-y-2 text-xs">
                    <div className="text-(--color-fg-mute)">{t.settings.authFile}: <span className="font-mono">{auth.auth_file ?? t.settings.none}</span> {auth.auth_file_exists ? "✓" : "✗"}</div>
                    <div>{t.settings.authProviders}: {auth.providers.length > 0 ? auth.providers.map((p) => `${p.provider} (${p.kind})`).join(", ") : t.settings.none}</div>
                    {agentDir && <Button variant="ghost" size="sm" icon={<ExternalLink size={12} />} onClick={() => void invoke("open_in_default_app", { path: agentDir })}>{t.settings.openAgentDir}</Button>}
                  </div>
                ) : <div className="text-xs text-(--color-fg-dim)">…</div>}
              </Section>
            </SettingsStack>
          </Tabs.Content>
        </div>
      </Tabs.Root>
    </Modal>
  );
}

