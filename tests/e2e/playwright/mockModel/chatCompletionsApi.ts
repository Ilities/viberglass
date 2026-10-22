import type { ServerResponse } from "http";
import type { JsonSchema, MockConversation, MockMessage, MockReply, MockToolCall, MockUsage } from "./mockModelTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => (isRecord(part) && typeof part.text === "string" ? part.text : "")).join("\n");
}

function parseArguments(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string") return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function toolCallsOf(message: Record<string, unknown>): MockToolCall[] {
  const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  return calls.flatMap((call): MockToolCall[] => {
    if (!isRecord(call) || !isRecord(call.function)) return [];
    return [{ id: String(call.id), name: String(call.function.name), arguments: parseArguments(call.function.arguments) }];
  });
}

function messageOf(message: unknown): MockMessage | undefined {
  if (!isRecord(message)) return undefined;
  const text = textOf(message.content);
  switch (message.role) {
    case "system":
    case "developer":
      return { role: "system", text };
    case "user":
      return { role: "user", text };
    case "assistant":
      return { role: "assistant", text, toolCalls: toolCallsOf(message) };
    case "tool":
      return { role: "tool", callId: String(message.tool_call_id), text };
    default:
      return undefined;
  }
}

function schemaOf(value: unknown): JsonSchema {
  return isRecord(value) ? value : {};
}

export function chatCompletionsConversation(body: Record<string, unknown>): MockConversation {
  const tools = Array.isArray(body.tools) ? body.tools : [];
  return {
    model: String(body.model),
    tools: tools.flatMap((tool) =>
      isRecord(tool) && isRecord(tool.function) ? [{ name: String(tool.function.name), parameters: schemaOf(tool.function.parameters) }] : [],
    ),
    messages: (Array.isArray(body.messages) ? body.messages : []).flatMap((message) => messageOf(message) ?? []),
  };
}

type MessageReply = Extract<MockReply, { kind: "message" }>;

function wireToolCalls(reply: MessageReply) {
  return reply.toolCalls.map((call, index) => ({
    index,
    id: call.id,
    type: "function",
    function: { name: call.name, arguments: JSON.stringify(call.arguments) },
  }));
}

function wireUsage(usage: MockUsage) {
  return { prompt_tokens: usage.inputTokens, completion_tokens: usage.outputTokens, total_tokens: usage.inputTokens + usage.outputTokens };
}

export function writeChatCompletion(
  res: ServerResponse,
  body: Record<string, unknown>,
  reply: MessageReply,
  usage: MockUsage,
): void {
  const id = `chatcmpl-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  const model = String(body.model);
  const finishReason = reply.toolCalls.length > 0 ? "tool_calls" : "stop";

  if (body.stream !== true) {
    res.writeHead(200, { "Content-Type": "application/json" }).end(
      JSON.stringify({
        id,
        object: "chat.completion",
        created,
        model,
        choices: [{ index: 0, message: { role: "assistant", content: reply.text || null, tool_calls: reply.toolCalls.length > 0 ? wireToolCalls(reply) : undefined }, finish_reason: finishReason }],
        usage: wireUsage(usage),
      }),
    );
    return;
  }

  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  const chunk = (choices: unknown[], extra: Record<string, unknown> = {}) =>
    res.write(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created, model, choices, ...extra })}\n\n`);
  chunk([{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }]);
  if (reply.text) chunk([{ index: 0, delta: { content: reply.text }, finish_reason: null }]);
  if (reply.toolCalls.length > 0) chunk([{ index: 0, delta: { tool_calls: wireToolCalls(reply) }, finish_reason: null }]);
  // Usage rides on the last chunk whether or not stream_options asked for it, as many compatible servers do.
  chunk([{ index: 0, delta: {}, finish_reason: finishReason }], { usage: wireUsage(usage) });
  res.end("data: [DONE]\n\n");
}
