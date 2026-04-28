// Типы протокола pi --mode rpc.
// Источник истины: <pi-coding-agent>/docs/rpc.md

export type ThinkingLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

export type StreamingBehavior = "steer" | "followUp";
export type QueueMode = "all" | "one-at-a-time";

export interface Model {
  provider: string;
  id: string;
  contextWindow?: number;
  reasoning?: boolean;
}

export interface RpcSessionState {
  model: Model | null;
  thinkingLevel: ThinkingLevel;
  isStreaming: boolean;
  isCompacting: boolean;
  steeringMode: QueueMode;
  followUpMode: QueueMode;
  sessionFile?: string;
  sessionId: string;
  sessionName?: string;
  autoCompactionEnabled: boolean;
  messageCount: number;
  pendingMessageCount: number;
}

export interface ImageContent {
  type: "image";
  data: string;
  mimeType: string;
}

export interface TextContent {
  type: "text";
  text: string;
}

export interface ThinkingContent {
  type: "thinking";
  text: string;
  signature?: string;
}

export interface ToolUseContent {
  type: "tool_use" | "toolUse";
  id?: string;
  name?: string;
  input?: unknown;
}

export interface ToolResultContent {
  type: "tool_result" | "toolResult";
  tool_use_id?: string;
  toolUseId?: string;
  content?: string | unknown;
  is_error?: boolean;
  isError?: boolean;
}

export type AnyContent =
  | TextContent
  | ImageContent
  | ThinkingContent
  | ToolUseContent
  | ToolResultContent
  | { type: string; [k: string]: unknown };

export interface AgentMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: AnyContent[] | string;
  api?: string;
  timestamp?: number;
  // pi также добавляет id/parentId, но они нам не нужны для рендера
  [k: string]: unknown;
}

export interface RpcResponse<T = unknown> {
  type: "response";
  id?: string;
  command: string;
  success: boolean;
  data?: T;
  error?: string;
}

export interface RpcEvent {
  type: string;
  [k: string]: unknown;
}

// === события (выборка ключевых) ===

export interface AgentStartEvent {
  type: "agent_start";
  messageId?: string;
}
export interface AgentEndEvent {
  type: "agent_end";
  reason?: string;
}
export interface MessageStartEvent {
  type: "message_start";
  messageId: string;
  role: "assistant" | "user";
}
export interface MessageUpdateEvent {
  type: "message_update";
  messageId: string;
  delta: AnyContent;
}
export interface MessageEndEvent {
  type: "message_end";
  messageId: string;
  message?: AgentMessage;
}
export interface ToolStartEvent {
  type: "tool_execution_start";
  id: string;
  name: string;
  input?: unknown;
  messageId?: string;
}
export interface ToolUpdateEvent {
  type: "tool_execution_update";
  id: string;
  delta?: unknown;
}
export interface ToolEndEvent {
  type: "tool_execution_end";
  id: string;
  output?: unknown;
  isError?: boolean;
}
export interface QueueUpdateEvent {
  type: "queue_update";
  steering?: unknown[];
  followUp?: unknown[];
  pendingMessageCount?: number;
}

// === extension UI requests (мы их no-op-аем) ===
export interface ExtensionUiRequest {
  type:
    | "extension_ui_request"
    | "extension_ui_select"
    | "extension_ui_confirm"
    | "extension_ui_input"
    | "extension_ui_editor";
  id: string;
  [k: string]: unknown;
}
