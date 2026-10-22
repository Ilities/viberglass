import type { MockMessage, MockModelApi, MockTool } from "./mockModelTypes";
import { isRecord, parseJsonObject, schemaOf, startEventStream, textOf, writeEvent, writeJson } from "./wireValues";

function itemOf(item: Record<string, unknown>): MockMessage | undefined {
  switch (item.type) {
    case "message":
    case undefined: {
      const text = textOf(item.content);
      if (item.role === "assistant") return { role: "assistant", text, toolCalls: [] };
      return { role: item.role === "user" ? "user" : "system", text };
    }
    case "function_call": {
      const name = typeof item.namespace === "string" ? `${item.namespace}${NAMESPACE_SEPARATOR}${String(item.name)}` : String(item.name);
      return { role: "assistant", text: "", toolCalls: [{ id: String(item.call_id), name, arguments: parseJsonObject(item.arguments) }] };
    }
    case "function_call_output":
      return { role: "tool", callId: String(item.call_id), text: typeof item.output === "string" ? item.output : textOf(item.output) };
    default:
      return undefined;
  }
}

/** How a namespaced tool's name reads to the mock, as Codex names MCP tools: `mcp__server__tool`. */
const NAMESPACE_SEPARATOR = "__";

function functionTools(tools: unknown, namespace?: string): MockTool[] {
  return (Array.isArray(tools) ? tools.filter(isRecord) : []).flatMap((tool): MockTool[] => {
    if (tool.type === "namespace") return functionTools(tool.tools, String(tool.name));
    if (tool.type !== "function") return [];
    const name = namespace ? `${namespace}${NAMESPACE_SEPARATOR}${String(tool.name)}` : String(tool.name);
    return [{ name, parameters: schemaOf(tool.parameters) }];
  });
}

function namespacesOf(body: Record<string, unknown>): string[] {
  const tools = Array.isArray(body.tools) ? body.tools.filter(isRecord) : [];
  return tools.filter((tool) => tool.type === "namespace").map((tool) => String(tool.name));
}

/** A call to a namespaced tool goes back as its own name, with the namespace beside it. */
function wireName(name: string, namespaces: string[]): { name: string; namespace?: string } {
  const namespace = namespaces.find((candidate) => name.startsWith(`${candidate}${NAMESPACE_SEPARATOR}`));
  return namespace ? { name: name.slice(namespace.length + NAMESPACE_SEPARATOR.length), namespace } : { name };
}

export const responsesApi: MockModelApi = {
  path: "/responses",

  conversation(body) {
    const input = typeof body.input === "string" ? [{ type: "message", role: "user", content: body.input }] : Array.isArray(body.input) ? body.input.filter(isRecord) : [];
    return {
      model: String(body.model),
      tools: functionTools(body.tools),
      messages: [{ role: "system", text: typeof body.instructions === "string" ? body.instructions : "" }, ...input.flatMap((item) => itemOf(item) ?? [])],
    };
  },

  writeReply(res, body, reply, usage) {
    const id = `resp_${Date.now()}`;
    const model = String(body.model);
    const output = [
      ...(reply.text
        ? [{ type: "message", id: `msg_${Date.now()}`, role: "assistant", status: "completed", content: [{ type: "output_text", text: reply.text, annotations: [] }] }]
        : []),
      ...reply.toolCalls.map((call) => ({
        type: "function_call",
        id: `fc_${call.id}`,
        call_id: call.id,
        ...wireName(call.name, namespacesOf(body)),
        arguments: JSON.stringify(call.arguments),
        status: "completed",
      })),
    ];
    const response = {
      id,
      object: "response",
      created_at: Math.floor(Date.now() / 1000),
      status: "completed",
      model,
      output,
      usage: {
        input_tokens: usage.inputTokens,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: usage.outputTokens,
        output_tokens_details: { reasoning_tokens: 0 },
        total_tokens: usage.inputTokens + usage.outputTokens,
      },
    };

    if (body.stream !== true) {
      writeJson(res, 200, response);
      return;
    }

    startEventStream(res);
    let sequence = 0;
    const event = (type: string, data: Record<string, unknown>) => writeEvent(res, { type, sequence_number: sequence++, ...data }, type);
    event("response.created", { response: { ...response, status: "in_progress", output: [], usage: null } });
    output.forEach((item, outputIndex) => {
      event("response.output_item.added", { output_index: outputIndex, item: { ...item, status: "in_progress" } });
      if (item.type === "message") {
        const text = reply.text;
        event("response.output_text.delta", { item_id: item.id, output_index: outputIndex, content_index: 0, delta: text });
        event("response.output_text.done", { item_id: item.id, output_index: outputIndex, content_index: 0, text });
      }
      event("response.output_item.done", { output_index: outputIndex, item });
    });
    event("response.completed", { response });
    res.end();
  },

  errorBody(status, message) {
    return { error: { message, type: status === 401 ? "invalid_request_error" : "server_error", code: status === 401 ? "invalid_api_key" : String(status) } };
  },
};
