import { create } from "zustand";
import * as rpc from "@/rpc/bridge";
import type { CustomAgentConfig } from "@/rpc/types";

interface CustomAgentsState {
  agents: CustomAgentConfig[];
  loading: boolean;
  error: string | null;
  listAgents(sessionId?: string | null): Promise<void>;
  getAgent(name: string, sessionId?: string | null): Promise<CustomAgentConfig | null>;
  saveAgent(payload: rpc.SaveAgentPayload, sessionId?: string | null): Promise<void>;
  deleteAgent(name: string, source: "project" | "user", sessionId?: string | null): Promise<void>;
}

export const useCustomAgentsStore = create<CustomAgentsState>((set) => ({
  agents: [],
  loading: false,
  error: null,

  async listAgents(sessionId) {
    set({ loading: true, error: null });
    try {
      const { agents } = await rpc.listAgents(sessionId);
      set({ agents, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  async getAgent(name, sessionId) {
    try {
      const { agent } = await rpc.getAgent(name, sessionId);
      return agent;
    } catch (e) {
      set({ error: (e as Error).message });
      return null;
    }
  },

  async saveAgent(payload, sessionId) {
    set({ loading: true, error: null });
    try {
      const { agents } = await rpc.saveAgent(payload, sessionId);
      set({ agents, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      throw e;
    }
  },

  async deleteAgent(name, source, sessionId) {
    set({ loading: true, error: null });
    try {
      const { agents } = await rpc.deleteAgent(name, source, sessionId);
      set({ agents, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      throw e;
    }
  },
}));
