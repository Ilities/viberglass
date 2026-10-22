import type { MockMessage, MockModelApi } from "./mockModelTypes";
import { isRecord, parseJsonObject, schemaOf, startEventStream, textOf, writeEvent, writeJson } from "./wireValues";

const ERROR_TYPES: Record<number, string> = {
  400: "invalid_request_error",
  401: "authentication_error",
  403: "permission_error",
  404: "not_found_error",
  429: "rate_limit_error",
};

function blocksOf(content: unknown): Record<string, unknown>[] {
  if (typeof content === "string") return [{ type: "text", text: content }];
  return Array.isArray(content) ? content.filter(isRecord) : [];
}

/** A user turn carries tool results as blocks beside its text; they become messages of their own. */
function messagesOf(message: unknown): MockMessage[] {
  if (!isRecord(message)) return [];
  const blocks = blocksOf(message.content);
  const text = blocks.filter((block) => block.type === "text").map((block) => String(block.text)).join("\n");
  if (message.role === "assistant") {
    const toolCalls = blocks
      .filter((block) => block.type === "tool_use")
      .map((block) => ({ id: String(block.id), name: String(block.name), arguments: parseJsonObject(block.input) }));
    return [{ role: "assistant", text, toolCalls }];
  }
  const results: MockMessage[] = blocks
    .filter((block) => block.type === "tool_result")
    .map((block) => ({ role: "tool", callId: String(block.tool_use_id), text: textOf(block.content) }));
  return text ? [...results, { role: "user", text }] : results;
}

export const anthropicMessagesApi: MockModelApi = {
  path: "/messages",

  conversation(body) {
    const tools = Array.isArray(body.tools) ? body.tools.filter(isRecord) : [];
    return {
      model: String(body.model),
      tools: tools.map((tool) => ({ name: String(tool.name), parameters: schemaOf(tool.input_schema) })),
      messages: [
        { role: "system", text: textOf(body.system) },
        ...(Array.isArray(body.messages) ? body.messages : []).flatMap(messagesOf),
      ],
    };
  },

  writeReply(res, body, reply, usage) {
    const id = `msg_${Date.now()}`;
    const model = String(body.model);
    const content = [
      ...(reply.text ? [{ type: "text", text: reply.text }] : []),
      ...reply.toolCalls.map((call) => ({ type: "tool_use", id: call.id, name: call.name, input: call.arguments })),
    ];
    const stopReason = reply.toolCalls.length > 0 ? "tool_use" : "end_turn";
    const wireUsage = { input_tokens: usage.inputTokens, output_tokens: usage.outputTokens };

    if (body.stream !== true) {
      writeJson(res, 200, { id, type: "message", role: "assistant", model, content, stop_reason: stopReason, stop_sequence: null, usage: wireUsage });
      return;
    }

    startEventStream(res);
    const event = (type: string, data: Record<string, unknown>) => writeEvent(res, { type, ...data }, type);
    event("message_start", {
      message: { id, type: "message", role: "assistant", model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: usage.inputTokens, output_tokens: 1 } },
    });
    let index = 0;
    if (reply.text) {
      event("content_block_start", { index, content_block: { type: "text", text: "" } });
      event("content_block_delta", { index, delta: { type: "text_delta", text: reply.text } });
      event("content_block_stop", { index: index++ });
    }
    for (const call of reply.toolCalls) {
      event("content_block_start", { index, content_block: { type: "tool_use", id: call.id, name: call.name, input: {} } });
      event("content_block_delta", { index, delta: { type: "input_json_delta", partial_json: JSON.stringify(call.arguments) } });
      event("content_block_stop", { index: index++ });
    }
    event("message_delta", { delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: usage.outputTokens } });
    event("message_stop", {});
    res.end();
  },

  errorBody(status, message) {
    return { type: "error", error: { type: ERROR_TYPES[status] ?? "api_error", message } };
  },
};
