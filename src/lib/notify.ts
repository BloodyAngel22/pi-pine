import { invoke } from "@tauri-apps/api/core";
import { resolveResource } from "@tauri-apps/api/path";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { onAction, sendNotification } from "@tauri-apps/plugin-notification";
import { useChat } from "@/store/chat";
import { useUiPrefs } from "@/store/uiPrefs";
import { useWindowFocus } from "@/store/windowFocus";

let iconPathPromise: Promise<string | null> | null = null;
function getIconPath(): Promise<string | null> {
  iconPathPromise ??= resolveResource("icons/icon.png").catch(() => null);
  return iconPathPromise;
}

// Совпадает с DEFAULT_SOUND в pi-mono-x (packages/coding-agent/src/core/notify.ts) —
// используем как дефолт и здесь, чтобы звук на permission/askUser совпадал со звуком
// на agent_end, даже пока пользователь не выбрал свой файл в настройках.
const DEFAULT_SOUND_PATH = "/usr/share/sounds/freedesktop/stereo/complete.oga";

/**
 * Отправляет нативное OS-уведомление, только если пользователь сейчас
 * реально не смотрит на эту вкладку (окно не в фокусе и/или открыта другая
 * вкладка). Читает состояние сторов напрямую через getState(), а не через
 * какой-либо переданный (возможно scoped) get/set — это единственный
 * надёжный способ узнать реально активную вкладку изнутри обработчиков
 * RPC-событий в chat.ts, где локальный `get()` может быть scoped на
 * конкретный tabId (см. makeScopedGet в chat.ts).
 *
 * `sound: true` включает звук — использовать только там, где звук больше
 * НИОТКУДА не играет. На agent_end звук уже проигрывает сам pi-mono-x
 * (paplay на стороне процесса агента, см. core/notify.ts) — там `sound`
 * передавать не нужно, иначе звук продублируется.
 *
 * Звук проигрывается отдельным вызовом `play_notification_sound` (paplay
 * в Rust), а не через поле `sound` плагина tauri-plugin-notification:
 * на Linux этот плагин прокидывает `sound` в notify-rust::sound_name(),
 * которое ставит D-Bus hint `sound-name` (тема + короткое имя вроде
 * "message-new-instant"), а НЕ `sound-file` — абсолютный путь к .oga/.wav
 * через этот hint не проигрывается ни одним daemon'ом.
 */
export async function notifyIfBackground(opts: { title: string; body: string; tabId: string; sound?: boolean }): Promise<void> {
  if (!useUiPrefs.getState().notificationsEnabled) return;
  if (useWindowFocus.getState().focused && useChat.getState().activeTabId === opts.tabId) return;
  const icon = await getIconPath();
  const agentState = useChat.getState().agentState;
  const soundEnabled = opts.sound && (agentState?.notificationSoundEnabled ?? true);
  const sound = soundEnabled ? agentState?.notificationSoundPath?.trim() || DEFAULT_SOUND_PATH : undefined;
  try {
    sendNotification({
      title: opts.title,
      body: opts.body,
      icon: icon ?? undefined,
      extra: { tabId: opts.tabId },
    });
  } catch {
    // Демон уведомлений недоступен / permission отозван — не мешаем работе приложения.
  }
  if (sound) {
    void invoke("play_notification_sound", { path: sound }).catch(() => {});
  }
}

let actionHandlerRegistered = false;

/**
 * Клик по уведомлению → фокус окна + переключение на связанную вкладку.
 * Best-effort: на Linux зависит от конкретного notification daemon (dunst,
 * GNOME Shell, KDE Plasma и т.д.), степень поддержки click-through не
 * гарантирована — если не сработает, само уведомление (title/body) уже
 * донесло основную ценность.
 */
export function registerNotificationActionHandler(): void {
  if (actionHandlerRegistered) return;
  actionHandlerRegistered = true;
  void onAction((notification) => {
    const tabId = (notification.extra as Record<string, unknown> | undefined)?.tabId;
    if (typeof tabId !== "string") return;
    void useChat.getState().activateTab(tabId);
    const win = getCurrentWindow();
    void win.show().catch(() => {});
    void win.unminimize().catch(() => {});
    void win.setFocus().catch(() => {});
  }).catch(() => {});
}
