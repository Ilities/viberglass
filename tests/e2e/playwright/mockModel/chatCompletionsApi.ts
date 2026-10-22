import type { MockMessage, MockMessageReply, MockModelApi, MockToolCall, MockUsage } from "./mockModelTypes";
import { isRecord, parseJsonObject, schemaOf, startEventStream, textOf, writeEvent, writeJson } from "./wireValues";

function toolCallsOf(message: Record<string, unknown>): MockToolCall[] {
  const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  return calls.flatMap((call): MockToolCall[] => {
    if (!isRecord(call) || !isRecord(call.function)) return [];
    return [{ id: String(call.id), name: String(call.function.name), arguments: parseJsonObject(call.function.arguments) }];
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

function wireToolCalls(reply: MockMessageReply) {
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

export const chatCompletionsApi: MockModelApi = {
  path: "/chat/completions",

  conversation(body) {
    const tools = Array.isArray(body.tools) ? body.tools : [];
    return {
      model: String(body.model),
      tools: tools.flatMap((tool) =>
        isRecord(tool) && isRecord(tool.function) ? [{ name: String(tool.function.name), parameters: schemaOf(tool.function.parameters) }] : [],
      ),
      messages: (Array.isArray(body.messages) ? body.messages : []).flatMap((message) => messageOf(message) ?? []),
    };
  },

  writeReply(res, body, reply, usage) {
    const id = `chatcmpl-${Date.now()}`;
    const created = Math.floor(Date.now() / 1000);
    const model = String(body.model);
    const finishReason = reply.toolCalls.length > 0 ? "tool_calls" : "stop";

    if (body.stream !== true) {
      const message = { role: "assistant", content: reply.text || null, tool_calls: reply.toolCalls.length > 0 ? wireToolCalls(reply) : undefined };
      writeJson(res, 200, { id, object: "chat.completion", created, model, choices: [{ index: 0, message, finish_reason: finishReason }], usage: wireUsage(usage) });
      return;
    }

    startEventStream(res);
    const chunk = (choices: unknown[], extra: Record<string, unknown> = {}) =>
      writeEvent(res, { id, object: "chat.completion.chunk", created, model, choices, ...extra });
    chunk([{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }]);
    if (reply.text) chunk([{ index: 0, delta: { content: reply.text }, finish_reason: null }]);
    if (reply.toolCalls.length > 0) chunk([{ index: 0, delta: { tool_calls: wireToolCalls(reply) }, finish_reason: null }]);
    // Usage rides on the last chunk whether or not stream_options asked for it, as many compatible servers do.
    chunk([{ index: 0, delta: {}, finish_reason: finishReason }], { usage: wireUsage(usage) });
    res.end("data: [DONE]\n\n");
  },

  errorBody(status, message) {
    return { error: { message, type: "invalid_request_error", code: String(status) } };
  },
};
