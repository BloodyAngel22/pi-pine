import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface TerminalInfo {
  id: string;
  name: string;
  cwd: string;
  pid?: number | null;
}

export interface TerminalDataEvent {
  id: string;
  data: string;
}

export interface TerminalExitEvent {
  id: string;
  exitCode?: number | null;
}

export function spawnTerminal(args: {
  cwd: string;
  name?: string;
  shell?: string;
  cols?: number;
  rows?: number;
}): Promise<TerminalInfo> {
  return invoke<TerminalInfo>("terminal_spawn", { args });
}

export function writeTerminal(terminalId: string, data: string): Promise<void> {
  return invoke("terminal_write", { args: { terminal_id: terminalId, data } });
}

export function resizeTerminal(terminalId: string, cols: number, rows: number): Promise<void> {
  return invoke("terminal_resize", { args: { terminal_id: terminalId, cols, rows } });
}

export function killTerminal(terminalId: string): Promise<void> {
  return invoke("terminal_kill", { args: { terminal_id: terminalId } });
}

export function listTerminals(): Promise<TerminalInfo[]> {
  return invoke<TerminalInfo[]>("terminal_list");
}

export function onTerminalData(fn: (event: TerminalDataEvent) => void): Promise<UnlistenFn> {
  return listen<TerminalDataEvent>("terminal://data", (event) => fn(event.payload));
}

export function onTerminalExit(fn: (event: TerminalExitEvent) => void): Promise<UnlistenFn> {
  return listen<TerminalExitEvent>("terminal://exit", (event) => fn(event.payload));
}
