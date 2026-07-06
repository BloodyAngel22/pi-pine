import { create } from "zustand";
import * as rpc from "@/rpc/bridge";
import type { McpServerStatusEntry } from "@/rpc/types";

interface McpStatusState {
  byName: Record<string, McpServerStatusEntry>;
  loading: boolean;
  error: string | null;
  refresh(sessionId?: string | null): Promise<void>;
}

export const useMcpStatus = create<McpStatusState>((set) => ({
  byName: {},
  loading: false,
  error: null,

  async refresh(sessionId) {
    set({ loading: true, error: null });
    try {
      const result = await rpc.getMcpStatus(sessionId);
      const byName: Record<string, McpServerStatusEntry> = {};
      for (const s of result.servers) byName[s.name] = s;
      set({ byName, loading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  },
}));
