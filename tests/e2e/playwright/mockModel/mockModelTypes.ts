import type { ServerResponse } from "http";

/** A tool the harness offers the model, with its JSON schema. */
export interface MockTool {
  name: string;
  parameters: JsonSchema;
}

export interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
}

export interface MockToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** A conversation as any of the API formats sends it. */
export type MockMessage =
  | { role: "system" | "user"; text: string }
  | { role: "assistant"; text: string; toolCalls: MockToolCall[] }
  | { role: "tool"; callId: string; text: string };

export interface MockConversation {
  model: string;
  tools: MockTool[];
  messages: MockMessage[];
}

export type MockReply =
  | { kind: "message"; text: string; toolCalls: MockToolCall[]; delayMs: number }
  | { kind: "error"; status: number; message: string };

export type MockMessageReply = Extract<MockReply, { kind: "message" }>;

export interface MockUsage {
  inputTokens: number;
  outputTokens: number;
}

/** One API format: how its requests read as a conversation, and how it answers. */
export interface MockModelApi {
  /** The route it serves, after the base URL's `/v1`. */
  path: string;
  conversation(body: Record<string, unknown>): MockConversation;
  writeReply(res: ServerResponse, body: Record<string, unknown>, reply: MockMessageReply, usage: MockUsage): void;
  errorBody(status: number, message: string): unknown;
}
