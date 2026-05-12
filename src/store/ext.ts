import { create } from "zustand";
import { onEvent, sendExtUiResponse } from "@/rpc/bridge";

export type NotifyKind = "info" | "warning" | "error" | "success";

export interface Toast {
  id: string;
  message: string;
  kind: NotifyKind;
  createdAt: number;
}

export interface DialogSelect {
  type: "select";
  id: string;
  title?: string;
  options: string[];
  timeout?: number;
}
export interface DialogConfirm {
  type: "confirm";
  id: string;
  title?: string;
  message?: string;
  timeout?: number;
}
export interface DialogInput {
  type: "input";
  id: string;
  title?: string;
  placeholder?: string;
  timeout?: number;
}
export interface DialogEditor {
  type: "editor";
  id: string;
  title?: string;
  prefill?: string;
  timeout?: number;
}
export interface DialogAskUser {
  type: "askUser";
  id: string;
  question: string;
  options: string[];
  allowMultiple: boolean;
  timeout?: number;
}
export interface DialogPermission {
  type: "permission";
  id: string;
  permissionType: "bash" | "file" | "mcp";
  permissionValue: string;
  timeout?: number;
}
export type DialogRequest =
  | DialogSelect
  | DialogConfirm
  | DialogInput
  | DialogEditor
  | DialogAskUser
  | DialogPermission;

interface ExtState {
  toasts: Toast[];
  /** ключ → строка-статус (от setStatus) */
  statuses: Record<string, string>;
  /** ключ → массив строк (от setWidget) */
  widgets: Record<string, string[]>;
  /** очередь dialog-запросов */
  dialogQueue: DialogRequest[];
  /** триггер для подстановки текста в композер (set_editor_text) */
  composerInjection: { text: string; nonce: number } | null;
  /** заголовок окна (setTitle) */
  windowTitle: string;
  yoloMode: boolean;

  init(): void;
  toggleYoloMode(): void;
  resolveDialog(payload: {
    value?: string;
    confirmed?: boolean;
    cancelled?: boolean;
    decision?: "allow-once" | "allow-always" | "deny-once" | "deny-always";
    scope?: "local" | "global" | "session";
    match?: string;
  }): void;
  dismissToast(id: string): void;
  clearComposerInjection(): void;
}

let initialized = false;
let toastSeq = 0;
const STORAGE_KEY_YOLO = "pi-pine.yoloMode";

function newToastId(): string {
  toastSeq += 1;
  return `t${toastSeq}`;
}

function isPlanFilePermission(permissionType: unknown, permissionValue: string): boolean {
  return permissionType === "file" && permissionValue.includes("/tmp/.pi/plans/");
}

export const useExt = create<ExtState>((set, get) => ({
  toasts: [],
  statuses: {},
  widgets: {},
  dialogQueue: [],
  composerInjection: null,
  windowTitle: "Pi Pine",
  yoloMode: localStorage.getItem(STORAGE_KEY_YOLO) === "1",

  init() {
    if (initialized) return;
    initialized = true;
    onEvent((event) => handleEvent(event, set, get));
  },

  toggleYoloMode() {
    const next = !get().yoloMode;
    if (next) localStorage.setItem(STORAGE_KEY_YOLO, "1");
    else localStorage.removeItem(STORAGE_KEY_YOLO);
    set({ yoloMode: next });
  },

  resolveDialog(payload) {
    const queue = get().dialogQueue;
    if (queue.length === 0) return;
    const top = queue[0];
    void sendExtUiResponse(top.id, payload).catch((e) => console.error(e));
    set({ dialogQueue: queue.slice(1) });
  },

  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  clearComposerInjection() {
    set({ composerInjection: null });
  },
}));

function handleEvent(
  event: Record<string, unknown>,
  set: (
    partial:
      | Partial<ExtState>
      | ((s: ExtState) => Partial<ExtState>),
  ) => void,
  get: () => ExtState,
) {
  if (event.type !== "extension_ui_request") return;
  const method = String(event.method ?? "");
  const id = String(event.id ?? "");

  switch (method) {
    case "notify": {
      const message = String(event.message ?? "");
      const kind = (event.notifyType as NotifyKind) ?? "info";
      const toast: Toast = {
        id: newToastId(),
        message,
        kind: ["info", "warning", "error", "success"].includes(kind)
          ? (kind as NotifyKind)
          : "info",
        createdAt: Date.now(),
      };
      set((s) => ({ toasts: [...s.toasts, toast].slice(-5) }));
      // авто-исчезновение
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== toast.id) }));
      }, 4500);
      break;
    }
    case "setStatus": {
      const key = String(event.statusKey ?? "");
      const text = (event.statusText as string | null | undefined) ?? null;
      if (!key) break;
      set((s) => {
        const next = { ...s.statuses };
        if (text == null || text === "") delete next[key];
        else next[key] = text;
        return { statuses: next };
      });
      break;
    }
    case "setWidget": {
      const key = String(event.widgetKey ?? event.key ?? "");
      const rawLines = event.widgetLines ?? event.lines;
      const lines = Array.isArray(rawLines)
        ? (rawLines as unknown[]).map((x) => String(x))
        : Array.isArray(event.lines)
        ? (event.lines as unknown[]).map((x) => String(x))
        : event.text != null
          ? [String(event.text)]
          : [];
      if (!key) break;
      set((s) => {
        const next = { ...s.widgets };
        if (lines.length === 0) delete next[key];
        else next[key] = lines;
        return { widgets: next };
      });
      break;
    }
    case "setTitle": {
      const title = String(event.title ?? "Pi Pine");
      set({ windowTitle: title });
      // ставим заголовок окна Tauri (best-effort)
      void import("@tauri-apps/api/webviewWindow")
        .then((m) => m.getCurrentWebviewWindow().setTitle(title))
        .catch(() => undefined);
      break;
    }
    case "set_editor_text": {
      const text = String(event.text ?? "");
      set({ composerInjection: { text, nonce: Date.now() } });
      break;
    }
    case "askUser":
    case "ask_user": {
      if (!id) break;
      const options = Array.isArray(event.options)
        ? (event.options as unknown[]).map((option) => {
            if (typeof option === "string") return option;
            if (option && typeof option === "object") {
              const o = option as Record<string, unknown>;
              const label = o.label ?? o.value ?? o.text;
              if (typeof label === "string") return label;
            }
            return String(option);
          })
        : [];
      set((s) => ({
        dialogQueue: [
          ...s.dialogQueue,
          {
            type: "askUser",
            id,
            question: String(event.question ?? event.title ?? "What would you like to do?"),
            options,
            allowMultiple: event.allowMultiple === true,
            timeout: typeof event.timeout === "number" ? (event.timeout as number) : undefined,
          },
        ],
      }));
      break;
    }
    case "permission": {
      if (!id) break;
      const permissionType = event.permissionType;
      if (permissionType !== "bash" && permissionType !== "file" && permissionType !== "mcp") break;
      const permissionValue = String(event.permissionValue ?? "");
      if (get().yoloMode) {
        void sendExtUiResponse(id, { decision: "allow-once" }).catch((e) => console.error(e));
        break;
      }
      if (isPlanFilePermission(permissionType, permissionValue)) {
        void sendExtUiResponse(id, { decision: "allow-once" }).catch((e) => console.error(e));
        break;
      }
      set((s) => ({
        dialogQueue: [
          ...s.dialogQueue,
          {
            type: "permission",
            id,
            permissionType,
            permissionValue,
          },
        ],
      }));
      break;
    }
    case "select":
    case "confirm":
    case "input":
    case "editor": {
      if (!id) break;
      const dialog: DialogRequest = (() => {
        if (method === "select") {
          return {
            type: "select",
            id,
            title: event.title as string | undefined,
            options: Array.isArray(event.options) ? (event.options as string[]) : [],
            timeout: typeof event.timeout === "number" ? (event.timeout as number) : undefined,
          };
        }
        if (method === "confirm") {
          return {
            type: "confirm",
            id,
            title: event.title as string | undefined,
            message: event.message as string | undefined,
            timeout: typeof event.timeout === "number" ? (event.timeout as number) : undefined,
          };
        }
        if (method === "input") {
          return {
            type: "input",
            id,
            title: event.title as string | undefined,
            placeholder: event.placeholder as string | undefined,
            timeout: typeof event.timeout === "number" ? (event.timeout as number) : undefined,
          };
        }
        return {
          type: "editor",
          id,
          title: event.title as string | undefined,
          prefill: event.prefill as string | undefined,
          timeout: typeof event.timeout === "number" ? (event.timeout as number) : undefined,
        };
      })();
      set((s) => ({ dialogQueue: [...s.dialogQueue, dialog] }));
      break;
    }
    default:
      // неизвестные методы игнорируем
      break;
  }
}
