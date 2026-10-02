import { QuestionRelay } from "./QuestionRelay";
import { QUESTION_RELAY_ENV, postToRelay } from "./questionRelayClient";
import type { AskHumanInput } from "./askHumanTool";

describe("QuestionRelay", () => {
  let relay: QuestionRelay | undefined;
  afterEach(async () => relay?.close());

  async function start(sendQuestion: (input: AskHumanInput) => Promise<{ askedOf: string | null; blocking: boolean }>) {
    relay = new QuestionRelay({ sendQuestion }, "/worker/ask-human-mcp.js", "/usr/bin/node");
    const server = await relay.start();
    const env = Object.fromEntries(server.env.map(({ name, value }) => [name, value]));
    return { server, url: env[QUESTION_RELAY_ENV.url], secret: env[QUESTION_RELAY_ENV.secret] };
  }

  const question: AskHumanInput = { question: "Which warehouse?", options: [], addressee: "requester", blocking: true };

  it("gives the harness an MCP server that reaches it, and only it", async () => {
    const { server, url, secret } = await start(async () => ({ askedOf: "Maria", blocking: true }));
    expect(server).toMatchObject({ name: "viberglass", command: "/usr/bin/node", args: ["/worker/ask-human-mcp.js"] });
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/questions$/);
    expect(secret).toHaveLength(48);
  });

  it("forwards a question to the platform and tells the agent to stop when it blocks", async () => {
    const sent: AskHumanInput[] = [];
    const { url, secret } = await start(async (input) => (sent.push(input), { askedOf: "Maria", blocking: true }));
    const reply = await postToRelay(url, secret, question);
    expect(sent).toEqual([question]);
    expect(reply).toContain("Your question is with Maria. End your turn now");
  });

  it("tells the agent to carry on when the question doesn't block", async () => {
    const { url, secret } = await start(async () => ({ askedOf: null, blocking: false }));
    expect(await postToRelay(url, secret, { ...question, blocking: false })).toContain("Carry on with the assumption you stated");
  });

  it("refuses a caller without the turn's secret", async () => {
    const sent: AskHumanInput[] = [];
    const { url } = await start(async (input) => (sent.push(input), { askedOf: "Maria", blocking: true }));
    await expect(postToRelay(url, "guess", question)).rejects.toThrow("forbidden");
    expect(sent).toHaveLength(0);
  });

  it("passes on why the platform couldn't take the question", async () => {
    const { url, secret } = await start(async () => {
      throw new Error("Job not found");
    });
    await expect(postToRelay(url, secret, question)).rejects.toThrow("Job not found");
  });
});
