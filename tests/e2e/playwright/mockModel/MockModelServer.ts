import { createServer, IncomingMessage, Server, ServerResponse } from "http";
import { chatCompletionsConversation, writeChatCompletion } from "./chatCompletionsApi";
import type { MockConversation, MockReply, MockUsage } from "./mockModelTypes";
import { decideMockReply } from "./scriptedModel";

export const MOCK_MODEL = "mock-model";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
    return this.requests.filter((request) => !request.conversation && !request.path.endsWith("/models"));
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
    const json = (status: number, body: unknown): void => {
      res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
    };

    if (recorded.authorization !== `Bearer ${this.apiKey}`) {
      return json(401, { error: { message: "Invalid API key", type: "invalid_request_error", code: "invalid_api_key" } });
    }
    if (req.method === "GET" && path.endsWith("/models")) {
      return json(200, { object: "list", data: [{ id: MOCK_MODEL, object: "model", owned_by: "mock" }] });
    }
    if (req.method !== "POST" || !path.endsWith("/chat/completions")) {
      return json(404, { error: { message: `The mock model doesn't serve ${req.method} ${path}` } });
    }

    const conversation = chatCompletionsConversation(recorded.body);
    const reply = decideMockReply(conversation);
    recorded.conversation = conversation;
    recorded.reply = reply;
    if (reply.kind === "error") {
      return json(reply.status, { error: { message: reply.message, type: "invalid_request_error", code: String(reply.status) } });
    }
    if (reply.delayMs > 0 && !(await this.waitUnlessAbandoned(res, reply.delayMs))) {
      recorded.abandoned = true;
      return;
    }
    writeChatCompletion(res, recorded.body, reply, usageOf(conversation, reply));
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
