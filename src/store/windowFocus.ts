import { getCurrentWindow } from "@tauri-apps/api/window";
import { create } from "zustand";

interface WindowFocusState {
  focused: boolean;
  init(): void;
}

let initOnce = false;

export const useWindowFocus = create<WindowFocusState>((set) => ({
  // По умолчанию true — до первого реального опроса состояния окна не хотим
  // ложно считать окно "в фоне" и слать лишнее уведомление на старте.
  focused: true,

  init() {
    if (initOnce) return;
    initOnce = true;
    try {
      const win = getCurrentWindow();
      void win.isFocused().then((focused) => set({ focused })).catch(() => {});
      void win.onFocusChanged(({ payload: focused }) => set({ focused })).catch(() => {});
    } catch {
      // Не в Tauri-контексте (например, обычный браузер при разработке) — оставляем focused: true.
    }
  },
}));
