import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export interface VirtualDisplayStatus {
  running: boolean;
  display: string;
  width: number;
  height: number;
  vnc_port: number;
}

interface VirtualDisplayState {
  status: VirtualDisplayStatus | null;
  screenshot: string | null; // base64 data URL
  error: string | null;
  visible: boolean; // whether the agent screen panel is open
  polling: boolean;
  
  start(width?: number, height?: number): Promise<void>;
  stop(): Promise<void>;
  refreshStatus(): Promise<void>;
  takeScreenshot(): Promise<void>;
  toggleVisible(): void;
  startPolling(): void;
  stopPolling(): void;
}

export const useVirtualDisplay = create<VirtualDisplayState>((set, get) => ({
  status: null,
  screenshot: null,
  error: null,
  visible: false,
  polling: false,

  async start(width, height) {
    try {
      const status = await invoke<VirtualDisplayStatus>("start_virtual_display", { width: width ?? null, height: height ?? null });
      set({ status, error: null });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  async stop() {
    try {
      await invoke("stop_virtual_display");
      set({ status: { running: false, display: ":99", width: 1920, height: 1080, vnc_port: 5900 }, screenshot: null });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  async refreshStatus() {
    try {
      const status = await invoke<VirtualDisplayStatus>("virtual_display_status");
      set({ status });
    } catch {
      // ignore
    }
  },

  async takeScreenshot() {
    try {
      const result = await invoke<{ data: string; mime_type: string }>("screenshot_virtual_display");
      const dataUrl = `data:${result.mime_type};base64,${result.data}`;
      set({ screenshot: dataUrl, error: null });
    } catch (e) {
      // Don't set error on polling failures (display might not be ready)
      if (!get().polling) set({ error: String(e) });
    }
  },

  toggleVisible() {
    const next = !get().visible;
    set({ visible: next });
    if (next) {
      void (async () => {
        await get().refreshStatus();
        if (!get().status?.running) {
          await get().start();
        }
        get().startPolling();
      })();
    } else {
      get().stopPolling();
    }
  },

  startPolling() {
    if (get().polling) return;
    set({ polling: true });
    const poll = async () => {
      if (!get().polling || !get().visible) return;
      await get().takeScreenshot();
      setTimeout(poll, 1500); // poll every 1.5s
    };
    poll();
  },

  stopPolling() {
    set({ polling: false });
  },
}));
