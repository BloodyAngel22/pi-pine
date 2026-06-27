import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AlertCircle, X, GitFork } from "lucide-react";
import { useChat, type UiMessage } from "@/store/chat";
import { useExt } from "@/store/ext";
import { useTheme } from "@/store/theme";
import { compact as rpcCompact, sendPrompt } from "@/rpc/bridge";
import { Header } from "@/components/Chat/Header";
import { MessageList } from "@/components/Chat/MessageList";
import { Composer } from "@/components/Chat/Composer";
import { PromptSearchPalette } from "@/components/Chat/PromptSearchPalette";
import { BtwOverlay } from "@/components/Chat/BtwOverlay";
import { StatusBar } from "@/components/Chat/StatusBar";
import { AgentScreen } from "@/components/VirtualDisplay";
import { TerminalPanel } from "@/components/Terminal/TerminalPanel";
import { TerminalErrorBoundary } from "@/components/Terminal/TerminalErrorBoundary";
import { SessionsSidebar } from "@/components/Sessions/SessionsSidebar";
import { SessionTabs } from "@/components/Sessions/SessionTabs";
import { SidePanel } from "@/components/SidePanel/SidePanel";
import { SettingsModal } from "@/components/Settings/SettingsModal";
import { PiMissingCard } from "@/components/Onboarding/PiMissingCard";
import { SplashScreen, type BootStage } from "@/components/Onboarding/SplashScreen";
import { Toasts } from "@/components/ExtUI/Toasts";
import { DialogQueue } from "@/components/ExtUI/DialogQueue";
import { Button } from "@/components/ui/Button";

interface EnvironmentInfo {
  home?: string;
  agent_dir?: string;
  pi_binary?: string;
  default_cwd: string;
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
  const loadTheme = useTheme((s) => s.load);

  const [bootstrapped, setBootstrapped] = useState(false);
  const [bootStage, setBootStage] = useState<BootStage>("init");
  const [bootCwd, setBootCwd] = useState<string | null>(null);
  const [bootNote, setBootNote] = useState<string | null>(null);
  const [piResolved, setPiResolved] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mainTab, setMainTab] = useState<"chat" | "terminal">("chat");
  const [keptChatTabIds, setKeptChatTabIds] = useState<string[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [btwOpen, setBtwOpen] = useState(false);
  const [btwQuestion, setBtwQuestion] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      initExt();
      void loadTheme();
      setBootStage("init");
      await init();
      if (cancelled) return;

      setBootStage("detect");
      // Параллельно запрашиваем env и CLI-аргумент `pi-pine [path]`.
      const [env, cliCwd] = await Promise.all([
        invoke<EnvironmentInfo>("detect_environment"),
        invoke<string | null>("parse_cli_cwd").catch(() => null),
      ]);
      if (cancelled) return;
      useChat.getState().setHome(env.home ?? null);

      // Приоритет cwd: CLI-аргумент → сохранённый в localStorage → default_cwd
      // CLI-аргумент перебивает сохранённый, чтобы `pi-pine .` всегда открывал
      // именно эту директорию (как в VSCode).
      if (cliCwd) {
        setCwd(cliCwd);
        setBootCwd(cliCwd);
      } else if (!localStorage.getItem("pi-pine.cwd") && env.default_cwd) {
        setCwd(env.default_cwd);
        setBootCwd(env.default_cwd);
      } else {
        setBootCwd(localStorage.getItem("pi-pine.cwd") || env.default_cwd);
      }

      const cliPath = cliPathOverride || env.pi_binary || null;
      if (!cliPath) {
        setBootNote("Не найден бинарник pi — настрой путь на следующем экране.");
        setBootstrapped(true);
        return;
      }
      setPiResolved(cliPath);

      setBootStage("starting");
      await startRpc();
      if (cancelled) return;

      setBootStage("ready");
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
        setPanelOpen(true);
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

  if (!bootstrapped) {
    return <SplashScreen stage={bootStage} cwd={bootCwd} note={bootNote} />;
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
    <div className="h-full w-full flex flex-col">
      <div className="flex-1 flex min-h-0">
        {sidebarOpen && <SessionsSidebar onClose={() => setSidebarOpen(false)} />}
        <main className="flex-1 flex flex-col min-w-0">
          <SessionTabs />
          <Header
            onToggleSidebar={() => setSidebarOpen((v) => !v)}
            onToggleSidePanel={() => setPanelOpen((v) => !v)}
            onOpenSettings={() => setSettingsOpen(true)}
            onNewSession={() => void createSessionTab()}
            onToggleBash={() => setMainTab("terminal")}
          />
          {errorBanner && (
            <div className="px-3 py-1.5 bg-(--color-danger)/15 border-b border-(--color-danger)/30 text-(--color-danger) text-xs flex items-center gap-2">
              <AlertCircle size={12} />
              <span className="flex-1">{errorBanner}</span>
              <Button
                variant="subtle"
                size="sm"
                onClick={() => void restartRpc()}
                title="Перезапустить pi с сохранённой моделью"
              >
                Перезапустить
              </Button>
              <Button
                variant="subtle"
                size="sm"
                onClick={() => void restartRpc({ safe: true })}
                title="Сбросить provider/model и стартовать с дефолтами pi"
              >
                Безопасный режим
              </Button>
              <button
                type="button"
                onClick={() => setError(null)}
                className="text-(--color-danger) hover:text-(--color-fg)"
              >
                <X size={12} />
              </button>
            </div>
          )}
          {forkBanner && (
            <div className="px-3 py-1.5 bg-(--color-accent)/10 border-b border-(--color-accent)/30 text-(--color-accent) text-xs flex items-center gap-2">
              <GitFork size={12} />
              <span className="flex-1">{forkBanner}</span>
              <button
                type="button"
                onClick={clearForkBanner}
                className="opacity-60 hover:opacity-100"
              >
                <X size={12} />
              </button>
            </div>
          )}
          {!rpcRunning && !errorBanner && (
            <div className="px-3 py-2 bg-(--color-warn)/10 border-b border-(--color-warn)/30 text-(--color-warn) text-xs flex items-center gap-2">
              <span className="flex-1">RPC не запущен</span>
              <Button variant="subtle" size="sm" onClick={() => void startRpc()}>
                Запустить
              </Button>
              <Button
                variant="subtle"
                size="sm"
                onClick={() => void restartRpc({ safe: true })}
                title="Сбросить provider/model и стартовать с дефолтами pi"
              >
                Безопасный режим
              </Button>
            </div>
          )}
          <div className="h-9 shrink-0 flex items-center gap-1 border-b border-(--color-border) bg-(--color-bg-soft) px-3">
            <button
              type="button"
              onClick={() => setMainTab("chat")}
              className={
                "h-7 px-3 rounded-md text-xs font-medium transition-colors " +
                (mainTab === "chat"
                  ? "bg-(--color-bg) text-(--color-fg) border border-(--color-border)"
                  : "text-(--color-fg-mute) hover:text-(--color-fg) hover:bg-(--color-bg-mute)")
              }
            >
              Chat
            </button>
            <button
              type="button"
              onClick={() => setMainTab("terminal")}
              className={
                "h-7 px-3 rounded-md text-xs font-medium transition-colors " +
                (mainTab === "terminal"
                  ? "bg-(--color-bg) text-(--color-fg) border border-(--color-border)"
                  : "text-(--color-fg-mute) hover:text-(--color-fg) hover:bg-(--color-bg-mute)")
              }
            >
              Terminal
            </button>
            <span className="ml-auto text-[10px] text-(--color-fg-dim)">Ctrl+`</span>
          </div>
          <div className={mainTab === "chat" ? "flex-1 min-h-0 flex flex-col" : "hidden"}>
            <div className="flex-1 min-h-0 relative">
              {tabOrder.length === 0 ? (
                <MessageList
                  active={mainTab === "chat"}
                  onCopy={onCopy}
                  onFork={onFork}
                  onRegenerate={onRegenerate}
                  onEdit={onEdit}
                />
              ) : (
                renderedChatTabIds.map((tabId) => {
                  const active = mainTab === "chat" && tabId === activeTabId;
                  return (
                    <div
                      key={tabId}
                      className={active ? "absolute inset-0 min-h-0 flex flex-col" : "hidden"}
                      aria-hidden={!active}
                    >
                      <MessageList
                        tabId={tabId}
                        active={active}
                        onCopy={onCopy}
                        onFork={onFork}
                        onRegenerate={onRegenerate}
                        onEdit={onEdit}
                      />
                    </div>
                  );
                })
              )}
            </div>
            <Composer onSlash={onSlash} onToggleBash={() => setMainTab("terminal")} onBtw={onBtw} />
          </div>
          <div className={mainTab === "terminal" ? "flex-1 min-h-0 flex flex-col" : "hidden"}>
            <TerminalErrorBoundary onBack={() => setMainTab("chat")}>
              <TerminalPanel open={mainTab === "terminal"} onClose={() => setMainTab("chat")} />
            </TerminalErrorBoundary>
          </div>
          <PromptSearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
          <BtwOverlay open={btwOpen} initialQuestion={btwQuestion} onClose={() => setBtwOpen(false)} />
        </main>
        {panelOpen && <SidePanel onClose={() => setPanelOpen(false)} />}
      </div>
      <StatusBar />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <Toasts />
      <DialogQueue />
      <AgentScreen />
    </div>
  );
}
