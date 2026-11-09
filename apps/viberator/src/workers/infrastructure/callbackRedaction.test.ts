import { createLogger } from "winston";
import { SessionEventForwarder } from "../../acp/SessionEventForwarder";
import { CallbackClient } from "./CallbackClient";
import { REDACTED, SecretRedactor } from "./SecretRedactor";

const logger = createLogger({ silent: true });
const MODEL_KEY = "model-key-value-123";
const SCM_TOKEN = "scm-token-abcdef-456";

let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  fetchSpy = jest.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
});

afterEach(() => {
  fetchSpy.mockRestore();
});

function client(): CallbackClient {
  return new CallbackClient(logger, {
    platformUrl: "http://platform",
    maxRetries: 0,
    retryDelay: 0,
    callbackToken: "cb",
    redactor: new SecretRedactor([MODEL_KEY, SCM_TOKEN]),
  });
}

function sentBody(): string {
  const init: unknown = fetchSpy.mock.calls[0]?.[1];
  const body = typeof init === "object" && init !== null && "body" in init ? init.body : undefined;
  return typeof body === "string" ? body : "";
}

describe("what the worker sends the platform", () => {
  it("takes secrets out of session events at any depth", async () => {
    const forwarder = new SessionEventForwarder(client().turn, logger);
    forwarder.setupForJob("job-1", "tenant-1");
    forwarder.enqueue({
      eventType: "tool_call_completed",
      payload: {
        toolCallId: "t1",
        title: "env",
        content: [{ type: "content", content: { type: "text", text: `ANTHROPIC_API_KEY=${MODEL_KEY}` } }],
        rawOutput: { stdout: `origin https://x-access-token:${SCM_TOKEN}@github.com/acme/web.git` },
      },
    });
    forwarder.enqueue({ eventType: "assistant_message", payload: { text: `Your key is ${MODEL_KEY}` } });

    await forwarder.flush();

    const body = sentBody();
    expect(body).not.toContain(MODEL_KEY);
    expect(body).not.toContain(SCM_TOKEN);
    expect(JSON.parse(body)).toEqual({
      events: [
        {
          eventType: "tool_call_completed",
          payload: {
            toolCallId: "t1",
            title: "env",
            content: [{ type: "content", content: { type: "text", text: `ANTHROPIC_API_KEY=${REDACTED}` } }],
            rawOutput: { stdout: `origin https://x-access-token:${REDACTED}@github.com/acme/web.git` },
          },
        },
        { eventType: "assistant_message", payload: { text: `Your key is ${REDACTED}` } },
      ],
    });
    forwarder.cleanup();
  });

  it("takes secrets out of the result's documents, error and logs", async () => {
    await client().sendResult("job-1", "tenant-1", {
      success: false,
      documents: { summary: `Used ${MODEL_KEY}` },
      errorMessage: `push failed for https://bot:${SCM_TOKEN}@git.example.com`,
      logs: [`key ${MODEL_KEY}`],
      changedFiles: [],
      executionTime: 1,
    });

    const body = sentBody();
    expect(body).not.toContain(MODEL_KEY);
    expect(body).not.toContain(SCM_TOKEN);
    expect(JSON.parse(body)).toMatchObject({ success: false, executionTime: 1, documents: { summary: `Used ${REDACTED}` } });
  });

  it("takes secrets out of progress messages and their details", async () => {
    await client().sendProgress("job-1", "tenant-1", { step: "failed", message: `failed with ${MODEL_KEY}`, details: { error: SCM_TOKEN } });

    expect(JSON.parse(sentBody())).toEqual({ step: "failed", message: `failed with ${REDACTED}`, details: { error: REDACTED } });
  });

  it("takes secrets out of log lines", async () => {
    await client().sendLogBatch("job-1", "tenant-1", [{ level: "info", message: `token is ${SCM_TOKEN}` }]);

    expect(sentBody()).not.toContain(SCM_TOKEN);
  });

  it("sends the agent's login as it is, since storing it is the point", async () => {
    await client().sendAgentLogin("job-1", "tenant-1", MODEL_KEY);

    expect(JSON.parse(sentBody())).toEqual({ credential: MODEL_KEY });
  });
});
