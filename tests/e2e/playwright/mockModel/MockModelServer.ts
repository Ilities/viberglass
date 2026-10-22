import { createServer, IncomingMessage, Server, ServerResponse } from "http";
import { anthropicMessagesApi } from "./anthropicMessagesApi";
import { chatCompletionsApi } from "./chatCompletionsApi";
import type { MockConversation, MockModelApi, MockReply, MockUsage } from "./mockModelTypes";
import { responsesApi } from "./responsesApi";
import { decideMockReply } from "./scriptedModel";
import { isRecord, writeJson } from "./wireValues";

const APIS: MockModelApi[] = [chatCompletionsApi, responsesApi, anthropicMessagesApi];
const COUNT_TOKENS = "/messages/count_tokens";

export const MOCK_MODEL = "mock-model";
/** The context length the mock's model list reports, as vLLM does: neither the local default nor any harness's own. */
export const MOCK_CONTEXT_WINDOW = 131072;

export interface RecordedModelRequest {
  method: string;
  path: string;
  authorization: string | undefined;
  body: Record<string, unknown>;
  conversation?: MockConversation;
  reply?: MockReply;
  /** The harness hung up before the reply was sent, as a cancelled run does. */
  abandoned: boolean;
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (chunks.length === 0) return {};
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Roughly four characters a token, so bigger conversations count for more. */
function usageOf(conversation: MockConversation, reply: MockReply): MockUsage {
  const input = JSON.stringify(conversation.messages).length + JSON.stringify(conversation.tools).length;
  const output = reply.kind === "message" ? reply.text.length + JSON.stringify(reply.toolCalls).length : 0;
  return { inputTokens: Math.ceil(input / 4), outputTokens: Math.max(1, Math.ceil(output / 4)) };
}

/**
 * A model endpoint for harness tests: it speaks the API formats harnesses
 * use, scripted by `decideMockReply`, and records every request so a test can
 * see what the harness sent.
 */
export class MockModelServer {
  readonly requests: RecordedModelRequest[] = [];
  private server?: Server;

  constructor(private readonly apiKey: string) {}

  async start(port: number): Promise<void> {
    this.server = createServer((req, res) => {
      this.handle(req, res).catch((error: unknown) => {
        if (!res.headersSent) res.writeHead(500).end(String(error));
      });
    });
    const server = this.server;
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      // Worker containers reach it through host.docker.internal.
      server.listen(port, "0.0.0.0", resolve);
    });
  }

  async stop(): Promise<void> {
    const server = this.server;
    if (!server) return;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  /** Requests to routes the mock doesn't serve: a harness calling something new. */
  unknownRequests(): RecordedModelRequest[] {
    return this.requests.filter((request) => !request.conversation && !request.path.endsWith("/models") && !request.path.endsWith(COUNT_TOKENS));
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = req.url?.split("?")[0] ?? "/";
    const recorded: RecordedModelRequest = {
      method: req.method ?? "GET",
      path,
      authorization: req.headers.authorization,
      body: await readBody(req),
      abandoned: false,
    };
    this.requests.push(recorded);
    const api = APIS.find((candidate) => path.endsWith(candidate.path));

    if (recorded.authorization !== `Bearer ${this.apiKey}`) {
      return writeJson(res, 401, (api ?? chatCompletionsApi).errorBody(401, "Invalid API key."));
    }
    if (req.method === "GET" && path.endsWith("/models")) {
      // Both the OpenAI and the Anthropic shapes of a model list.
      const model = {
        id: MOCK_MODEL,
        object: "model",
        type: "model",
        display_name: MOCK_MODEL,
        owned_by: "mock",
        created_at: "2026-01-01T00:00:00Z",
        max_model_len: MOCK_CONTEXT_WINDOW,
      };
      return writeJson(res, 200, { object: "list", data: [model], has_more: false, first_id: MOCK_MODEL, last_id: MOCK_MODEL });
    }
    if (req.method === "POST" && path.endsWith(COUNT_TOKENS)) {
      return writeJson(res, 200, { input_tokens: Math.ceil(JSON.stringify(recorded.body).length / 4) });
    }
    if (req.method !== "POST" || !api) {
      return writeJson(res, 404, chatCompletionsApi.errorBody(404, `The mock model doesn't serve ${req.method} ${path}`));
    }

    const conversation = api.conversation(recorded.body);
    const reply = decideMockReply(conversation);
    recorded.conversation = conversation;
    recorded.reply = reply;
    if (reply.kind === "error") return writeJson(res, reply.status, api.errorBody(reply.status, reply.message));
    if (reply.delayMs > 0 && !(await this.waitUnlessAbandoned(res, reply.delayMs))) {
      recorded.abandoned = true;
      return;
    }
    api.writeReply(res, recorded.body, reply, usageOf(conversation, reply));
  }

  /** False when the harness hung up while the reply was held back. */
  private waitUnlessAbandoned(res: ServerResponse, ms: number): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        res.off("close", onClose);
        resolve(true);
      }, ms);
      const onClose = () => {
        clearTimeout(timer);
        resolve(false);
      };
      res.once("close", onClose);
    });
  }
}
