import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AlertCircle, X, GitFork } from "@/components/ui/icons/compat";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useChat, type StartupProgressEvent, type UiMessage } from "@/store/chat";
import { useExt } from "@/store/ext";
import { useDiff } from "@/store/diff";
import { useTheme } from "@/store/theme";
import { compact as rpcCompact, sendPrompt } from "@/rpc/bridge";
import { LeftRail } from "@/components/AppShell/LeftRail";
import { RightRail } from "@/components/AppShell/RightRail";
import { MessageList } from "@/components/Chat/MessageList";
import { Composer } from "@/components/Chat/Composer";
import { PromptSearchPalette } from "@/components/Chat/PromptSearchPalette";
import { BtwOverlay } from "@/components/Chat/BtwOverlay";
import { StatusBar } from "@/components/Chat/StatusBar";
import { AgentScreen } from "@/components/VirtualDisplay";
import { TerminalPanel } from "@/components/Terminal/TerminalPanel";
import { DiffPanel } from "@/components/Diff/DiffPanel";
import { TerminalErrorBoundary } from "@/components/Terminal/TerminalErrorBoundary";
import { SessionsSidebar } from "@/components/Sessions/SessionsSidebar";
import { SessionTabs } from "@/components/Sessions/SessionTabs";
import { SidePanel, type SidePanelTab } from "@/components/SidePanel/SidePanel";
import { SettingsModal } from "@/components/Settings/SettingsModal";
import { PiMissingCard } from "@/components/Onboarding/PiMissingCard";
import { SplashScreen, type BootDetail, type BootLogEntry, type BootStage } from "@/components/Onboarding/SplashScreen";
import { Toasts } from "@/components/ExtUI/Toasts";
import { DialogQueue } from "@/components/ExtUI/DialogQueue";
import { Button } from "@/components/ui/Button";
import { panelSpring, sidePanelVariants, softEase } from "@/lib/motionPresets";

interface EnvironmentInfo {
  home?: string;
  agent_dir?: string;
  auth_file?: string;
  settings_file?: string;
  sessions_dir?: string;
  pi_binary?: string;
  default_cwd: string;
}

const BOOT_LOG_LIMIT = 6;
const BOOT_TEXT_LIMIT = 180;

function shortBootText(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= BOOT_TEXT_LIMIT) return normalized;
  return `${normalized.slice(0, BOOT_TEXT_LIMIT - 1)}…`;
}

function bootProgressText(event: StartupProgressEvent): string {
  return event.detail ? `${event.label} — ${event.detail}` : event.label;
}

export default function App() {
  const init = useChat((s) => s.init);
  const startRpc = useChat((s) => s.startRpc);
  const restartRpc = useChat((s) => s.restartRpc);
  const refreshState = useChat((s) => s.refreshState);
  const newSession = useChat((s) => s.newSession);
  const createSessionTab = useChat((s) => s.createSessionTab);
  const createForkTab = useChat((s) => s.createForkTab);
  const closeSessionTab = useChat((s) => s.closeSessionTab);
  const activateTab = useChat((s) => s.activateTab);
  const setError = useChat((s) => s.setError);
  const commitPlan = useChat((s) => s.commitPlan);
  const errorBanner = useChat((s) => s.errorBanner);
  const forkBanner = useChat((s) => s.forkBanner);
  const clearForkBanner = useChat((s) => s.clearForkBanner);
  const piPath = useChat((s) => s.piPath);
  const cliPathOverride = useChat((s) => s.cliPathOverride);
  const cwd = useChat((s) => s.cwd);
  const setCwd = useChat((s) => s.setCwd);
  const rpcRunning = useChat((s) => s.rpcRunning);
  const tabOrder = useChat((s) => s.tabOrder);
  const activeTabId = useChat((s) => s.activeTabId);
  const loadAvailableModels = useChat((s) => s.loadAvailableModels);
  const initExt = useExt((s) => s.init);
  const initDiff = useDiff((s) => s.init);
  const refreshDiff = useDiff((s) => s.refresh);
  const loadTheme = useTheme((s) => s.load);
  const reduceMotion = useReducedMotion();

  const [bootstrapped, setBootstrapped] = useState(false);
  const [bootStage, setBootStage] = useState<BootStage>("init");
  const [bootCwd, setBootCwd] = useState<string | null>(null);
  const [bootNote, setBootNote] = useState<string | null>(null);
  const [bootAction, setBootAction] = useState<string | null>(null);
  const [bootDetails, setBootDetails] = useState<BootDetail[]>([]);
  const [bootLogs, setBootLogs] = useState<BootLogEntry[]>([]);
  const [piResolved, setPiResolved] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [activePanelTab, setActivePanelTab] = useState<SidePanelTab>(() => {
    const saved = localStorage.getItem("pi-pine.sidePanelTab");
    return saved === "models" || saved === "presets" || saved === "mcp" || saved === "status" || saved === "plan" || saved === "tree" || saved === "subagents" || saved === "commands"
      ? saved
      : "tree";
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mainTab, setMainTab] = useState<"chat" | "terminal" | "diff">("chat");
  const [keptChatTabIds, setKeptChatTabIds] = useState<string[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [btwOpen, setBtwOpen] = useState(false);
  const [btwQuestion, setBtwQuestion] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    let bootLogCounter = 0;
    const appendBootLog = (text: string, tone: BootLogEntry["tone"] = "muted") => {
      if (cancelled) return;
      const clipped = shortBootText(text);
      if (!clipped) return;
      bootLogCounter += 1;
      setBootLogs((prev) => {
        if (prev.at(-1)?.text === clipped) return prev;
        return [...prev, { id: `${Date.now()}-${bootLogCounter}`, text: clipped, tone }].slice(-BOOT_LOG_LIMIT);
      });
    };
    const setBootDetail = (label: string, value: string | null | undefined, tone: BootDetail["tone"] = "normal") => {
      if (cancelled || !value) return;
      setBootDetails((prev) => [...prev.filter((d) => d.label !== label), { label, value, tone }]);
    };
    const handleStartupProgress = (event: StartupProgressEvent) => {
      if (cancelled) return;
      const text = bootProgressText(event);
      setBootAction(shortBootText(text));
      appendBootLog(text, event.tone ?? "muted");
      if (event.id === "mcp:status" || event.id === "mcp:error") {
        setBootDetail("MCP", event.label.replace(/^MCP:\s*/, ""), event.tone);
      }
      if (event.id === "session:selected") {
        setBootDetail("session", event.detail ? "restored" : "new", event.tone);
      }
      if (event.id === "rpc:started" && event.detail) {
        setBootDetail("pi", event.detail, "success");
      }
      if (event.tone === "danger") {
        setBootNote(event.label);
      }
    };

    (async () => {
      initExt();
      initDiff();
      void loadTheme();
      setBootStage("init");
      setBootAction("Готовим UI и подписки RPC…");
      appendBootLog("Инициализация UI…");
      await init();
      if (cancelled) return;

      setBootStage("detect");
      setBootAction("Определяем окружение и рабочую директорию…");
      appendBootLog("Запрашиваем detect_environment и CLI cwd…");
      // Параллельно запрашиваем env и CLI-аргумент `pi-pine [path]`.
      const [env, cliCwd] = await Promise.all([
        invoke<EnvironmentInfo>("detect_environment"),
        invoke<string | null>("parse_cli_cwd").catch(() => null),
      ]);
      if (cancelled) return;
      useChat.getState().setHome(env.home ?? null);
      setBootDetail("agent dir", env.agent_dir, "muted");
      setBootDetail("settings", env.settings_file, "muted");

      // Приоритет cwd: CLI-аргумент → сохранённый в localStorage → default_cwd
      // CLI-аргумент перебивает сохранённый, чтобы `pi-pine .` всегда открывал
      // именно эту директорию (как в VSCode).
      const savedCwd = localStorage.getItem("pi-pine.cwd");
      let selectedCwd = env.default_cwd;
      let cwdSource = "default";
      if (cliCwd) {
        selectedCwd = cliCwd;
        cwdSource = "CLI argument";
      } else if (!savedCwd && env.default_cwd) {
        selectedCwd = env.default_cwd;
        cwdSource = "default cwd";
      } else {
        selectedCwd = savedCwd || env.default_cwd;
        cwdSource = savedCwd ? "saved localStorage" : "default cwd";
      }
      setCwd(selectedCwd);
      setBootCwd(selectedCwd);
      setBootDetail("cwd", selectedCwd);
      setBootDetail("cwd source", cwdSource, cliCwd ? "success" : "muted");
      appendBootLog(`cwd: ${selectedCwd} (${cwdSource})`, cliCwd ? "success" : "muted");

      const cliPath = cliPathOverride || env.pi_binary || null;
      if (!cliPath) {
        setBootDetail("pi", "not found", "danger");
        setBootNote("Не найден бинарник pi — настрой путь на следующем экране.");
        appendBootLog("Бинарник pi не найден", "danger");
        setBootstrapped(true);
        return;
      }
      setPiResolved(cliPath);
      setBootDetail("pi", cliPath, cliPathOverride ? "warn" : "success");
      appendBootLog(`pi: ${cliPath}`, "success");

      setBootStage("starting");
      setBootAction("Запускаем pi…");
      await startRpc({ onStartupProgress: handleStartupProgress });
      if (cancelled) return;

      setBootStage("ready");
      setBootAction("pi готов к работе");
      appendBootLog("pi готов к работе", "success");
      // Минимальная задержка, чтобы splash успел показать «готово».
      await new Promise((r) => setTimeout(r, 120));
      if (cancelled) return;
      setBootstrapped(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeTabId) return;
    setKeptChatTabIds((prev) => [activeTabId, ...prev.filter((id) => id !== activeTabId && tabOrder.includes(id))].slice(0, 5));
  }, [activeTabId, tabOrder]);

  useEffect(() => {
    if (mainTab === "diff") void refreshDiff();
  }, [mainTab, refreshDiff]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen("pi://auth-changed", () => {
      void refreshState();
      void loadAvailableModels();
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [refreshState, loadAvailableModels]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inEditable =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === "b" && !e.shiftKey) {
        e.preventDefault();
        setSidebarOpen((v) => !v);
        return;
      }
      if (ctrl && e.shiftKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setPanelOpen((v) => !v);
        return;
      }
      if (ctrl && e.key === ",") {
        e.preventDefault();
        setSettingsOpen(true);
        return;
      }
      if (ctrl && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (ctrl && e.key.toLowerCase() === "n") {
        if (inEditable) return;
        e.preventDefault();
        void createSessionTab();
        return;
      }
      if (ctrl && e.key.toLowerCase() === "w") {
        if (inEditable) return;
        e.preventDefault();
        const st = useChat.getState();
        if (st.activeTabId) void closeSessionTab(st.activeTabId);
        return;
      }
      if (ctrl && e.key === "Tab") {
        e.preventDefault();
        const st = useChat.getState();
        if (st.tabOrder.length > 0) {
          const idx = Math.max(0, st.tabOrder.indexOf(st.activeTabId ?? st.tabOrder[0]));
          const next = e.shiftKey
            ? st.tabOrder[(idx - 1 + st.tabOrder.length) % st.tabOrder.length]
            : st.tabOrder[(idx + 1) % st.tabOrder.length];
          void activateTab(next);
        }
        return;
      }
      if (ctrl && (e.key === "`" || e.code === "Backquote")) {
        e.preventDefault();
        setMainTab((v) => (v === "terminal" ? "chat" : "terminal"));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activateTab, closeSessionTab, commitPlan, createSessionTab, newSession]);

  const onSlash = (cmd: string, arg = "") => {
    switch (cmd) {
      case "/new":
        void createSessionTab();
        break;
      case "/forktab":
        void createForkTab();
        break;
      case "/sessions":
        setSidebarOpen(true);
        break;
      case "/model":
        selectPanel("models");
        break;
      case "/settings":
        setSettingsOpen(true);
        break;
      case "/cd":
      case "/pwd":
      case "/ls":
        void useChat.getState().runSlashCommand(cmd, arg);
        break;
      case "/search":
        setSearchOpen(true);
        break;
      case "/execute":
        void commitPlan();
        break;
      case "/compact":
        rpcCompact().catch((e) => setError(String(e)));
        break;
      case "/abort":
        void useChat.getState().abortStreaming();
        break;
      default:
        // Send unknown slash commands to pi (extensions, skills, templates)
        void sendPrompt(`${cmd} ${arg}`.trim());
        break;
    }
  };

  const onCopy = (_text: string) => {
    // toast уведомление можно добавить, но navigator.clipboard уже сработал
  };
  const isStreaming = useChat((s) => s.agentState?.isStreaming ?? false);
  const onFork = (m: UiMessage) => {
    if (isStreaming) return;
    void useChat.getState().forkAt(m.id);
  };
  const onRegenerate = (m: UiMessage) => {
    if (isStreaming) return;
    void useChat.getState().regenerateAt(m.id);
  };
  const onEdit = (m: UiMessage, text: string) => {
    if (isStreaming) return;
    void useChat.getState().editUserMessage(m.id, text);
  };
  const onBtw = (question?: string) => {
    setBtwQuestion(question);
    setBtwOpen(true);
  };

  const renderedChatTabIds = tabOrder.filter((tabId) => tabId === activeTabId || keptChatTabIds.includes(tabId));
  const selectPanel = (tab: SidePanelTab) => {
    localStorage.setItem("pi-pine.sidePanelTab", tab);
    setActivePanelTab(tab);
    setPanelOpen((open) => !(open && activePanelTab === tab));
  };

  const bannerMotion = reduceMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.12 },
      }
    : {
        initial: { opacity: 0, y: -6 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -6 },
        transition: softEase,
      };

  if (!bootstrapped) {
    return (
      <SplashScreen
        stage={bootStage}
        cwd={bootCwd}
        note={bootNote}
        currentAction={bootAction}
        details={bootDetails}
        logs={bootLogs}
      />
    );
  }

  const cliPath = cliPathOverride || piPath || piResolved;
  if (!cliPath) {
    return (
      <PiMissingCard
        onResolved={async (found) => {
          setPiResolved(found);
          await startRpc();
        }}
      />
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-(--color-bg) text-(--color-fg)">
      <div className="flex h-full min-h-0 flex-col">
        <div className="relative flex min-h-0 flex-1">
          <LeftRail
            sessionsOpen={sidebarOpen}
            onToggleSessions={() => setSidebarOpen((v) => !v)}
            onNewSession={() => void createSessionTab()}
            onOpenSearch={() => setSearchOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
            diffOpen={mainTab === "diff"}
            onToggleDiff={() => setMainTab((v) => (v === "diff" ? "chat" : "diff"))}
          />
          <AnimatePresence initial={false}>
            {sidebarOpen && (
              <SessionsSidebar
                key="sessions-sidebar"
                motionInitial="hidden"
                motionAnimate="visible"
                motionExit="exit"
                motionVariants={sidePanelVariants("left", Boolean(reduceMotion))}
                motionTransition={panelSpring}
                onClose={() => setSidebarOpen(false)}
              />
            )}
          </AnimatePresence>
          <main className="flex min-w-0 flex-1 flex-col bg-(--color-bg)">
            <SessionTabs />
            <AnimatePresence initial={false}>
              {errorBanner && (
                <motion.div
                  key="error-banner"
                  {...bannerMotion}
                  className="flex items-center gap-2 border-b border-(--color-danger)/30 bg-(--color-danger)/15 px-3 py-1.5 text-xs text-(--color-danger)"
                >
                  <AlertCircle size={12} />
                  <span className="flex-1">{errorBanner}</span>
                  <Button variant="subtle" size="sm" onClick={() => void restartRpc()} title="Перезапустить pi с сохранённой моделью">
                    Перезапустить
                  </Button>
                  <Button variant="subtle" size="sm" onClick={() => void restartRpc({ safe: true })} title="Сбросить provider/model и стартовать с дефолтами pi">
                    Безопасный режим
                  </Button>
                  <button type="button" onClick={() => setError(null)} className="text-(--color-danger) hover:text-(--color-fg)" aria-label="Закрыть ошибку">
                    <X size={12} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
            <AnimatePresence initial={false}>
              {forkBanner && (
                <motion.div
                  key="fork-banner"
                  {...bannerMotion}
                  className="flex items-center gap-2 border-b border-(--color-accent)/30 bg-(--color-accent)/10 px-3 py-1.5 text-xs text-(--color-accent)"
                >
                  <GitFork size={12} />
                  <span className="flex-1">{forkBanner}</span>
                  <button type="button" onClick={clearForkBanner} className="opacity-60 hover:opacity-100" aria-label="Закрыть уведомление">
                    <X size={12} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
            <AnimatePresence initial={false}>
              {!rpcRunning && !errorBanner && (
                <motion.div
                  key="rpc-stopped-banner"
                  {...bannerMotion}
                  className="flex items-center gap-2 border-b border-(--color-warn)/30 bg-(--color-warn)/10 px-3 py-2 text-xs text-(--color-warn)"
                >
                  <span className="flex-1">RPC не запущен</span>
                  <Button variant="subtle" size="sm" onClick={() => void startRpc()}>
                    Запустить
                  </Button>
                  <Button variant="subtle" size="sm" onClick={() => void restartRpc({ safe: true })} title="Сбросить provider/model и стартовать с дефолтами pi">
                    Безопасный режим
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
            <div className={mainTab === "chat" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
              <div className="relative min-h-0 flex-1">
                {tabOrder.length === 0 ? (
                  <MessageList active={mainTab === "chat"} onCopy={onCopy} onFork={onFork} onRegenerate={onRegenerate} onEdit={onEdit} />
                ) : (
                  renderedChatTabIds.map((tabId) => {
                    const active = mainTab === "chat" && tabId === activeTabId;
                    return (
                      <div key={tabId} className={active ? "absolute inset-0 flex min-h-0 flex-col" : "hidden"} aria-hidden={!active}>
                        <MessageList tabId={tabId} active={active} onCopy={onCopy} onFork={onFork} onRegenerate={onRegenerate} onEdit={onEdit} />
                      </div>
                    );
                  })
                )}
              </div>
              <Composer onSlash={onSlash} onToggleBash={() => setMainTab("terminal")} onBtw={onBtw} active={mainTab === "chat"} />
            </div>
            <div className={mainTab === "terminal" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
              <TerminalErrorBoundary onBack={() => setMainTab("chat")}>
                <TerminalPanel open={mainTab === "terminal"} onClose={() => setMainTab("chat")} />
              </TerminalErrorBoundary>
            </div>
            <div className={mainTab === "diff" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
              <DiffPanel open={mainTab === "diff"} onClose={() => setMainTab("chat")} />
            </div>
            <PromptSearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
            <BtwOverlay open={btwOpen} initialQuestion={btwQuestion} onClose={() => setBtwOpen(false)} />
          </main>
          <AnimatePresence initial={false}>
            {panelOpen && (
              <SidePanel
                key="side-panel"
                activeTab={activePanelTab}
                onTabChange={setActivePanelTab}
                onClose={() => setPanelOpen(false)}
                motionInitial="hidden"
                motionAnimate="visible"
                motionExit="exit"
                motionVariants={sidePanelVariants("right", Boolean(reduceMotion))}
                motionTransition={panelSpring}
              />
            )}
          </AnimatePresence>
          <RightRail
            activeTab={activePanelTab}
            panelOpen={panelOpen}
            mainTab={mainTab}
            onSelectPanel={selectPanel}
            onToggleTerminal={() => setMainTab((v) => (v === "terminal" ? "chat" : "terminal"))}
          />
        </div>
        <StatusBar />
      </div>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <Toasts />
      <DialogQueue />
      <AgentScreen />
    </div>
  );
}
