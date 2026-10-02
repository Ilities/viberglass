import { randomBytes } from "crypto";
import * as http from "http";
import type { AcpMcpServer } from "@viberglass/agent-core";
import { askedReply, parseAskHumanInput, type AskHumanInput } from "./askHumanTool";
import { QUESTION_RELAY_ENV, QUESTION_RELAY_SECRET_HEADER } from "./questionRelayClient";

/** Where a question goes: the platform, which says whom it reached. */
export interface QuestionSender {
  sendQuestion(input: AskHumanInput): Promise<{ askedOf: string | null; blocking: boolean }>;
}

const MAX_BODY = 64 * 1024;

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
      if (body.length > MAX_BODY) reject(new Error("question too long"));
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * A localhost endpoint, for one turn, that the agent's `ask_human` MCP server
 * posts questions to. The worker forwards them to the platform, so the run's
 * callback token never enters the agent's environment; the MCP server only gets
 * this address and a secret for the turn.
 */
export class QuestionRelay {
  private server?: http.Server;
  private readonly secret = randomBytes(24).toString("hex");

  constructor(
    private readonly sender: QuestionSender,
    private readonly serverScript: string,
    private readonly nodePath: string = process.execPath,
  ) {}

  /** Starts listening and returns the MCP server for the harness to start. */
  async start(): Promise<AcpMcpServer> {
    const server = http.createServer((req, res) => void this.handle(req, res));
    this.server = server;
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    const port = typeof address === "object" && address !== null ? address.port : 0;
    return {
      name: "viberglass",
      command: this.nodePath,
      args: [this.serverScript],
      env: [
        { name: QUESTION_RELAY_ENV.url, value: `http://127.0.0.1:${port}/questions` },
        { name: QUESTION_RELAY_ENV.secret, value: this.secret },
      ],
    };
  }

  async close(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    if (!server) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const respond = (status: number, body: Record<string, unknown>) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.method !== "POST" || req.url !== "/questions") return respond(404, { error: "not found" });
    if (req.headers[QUESTION_RELAY_SECRET_HEADER] !== this.secret) return respond(403, { error: "forbidden" });
    try {
      const input = parseAskHumanInput(parseJson(await readBody(req)));
      if ("error" in input) return respond(400, { error: input.error });
      const sent = await this.sender.sendQuestion(input);
      respond(200, { text: askedReply(sent.askedOf, sent.blocking) });
    } catch (error) {
      respond(502, { error: error instanceof Error ? error.message : String(error) });
    }
  }
}
