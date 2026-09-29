import type { Thread } from "chat";
import type { AgentSessionEvent } from "../../../persistence/agentSession/AgentSessionEventDAO";
import type { AgentSessionEventType } from "../../../types/agentSession";

const mockListBySession = jest.fn();

jest.mock("chat", () => ({
  Card: jest.fn(),
  CardText: jest.fn(),
  Actions: jest.fn(),
  Button: jest.fn(),
}), { virtual: true }); // "chat" is ESM-only and doesn't resolve under Jest
jest.mock("../../../chat/sessionThreadMap", () => ({
  getThreadForSession: jest.fn(),
  unlinkSession: jest.fn(),
}));
jest.mock("../../../persistence/agentSession/AgentSessionEventDAO", () => ({
  AgentSessionEventDAO: jest.fn(() => ({ listBySession: mockListBySession })),
}));
jest.mock("../../../persistence/agentSession/AgentSessionDAO", () => ({
  AgentSessionDAO: jest.fn(() => ({ getById: jest.fn() })),
}));
jest.mock("../../../persistence/agentSession/AgentTurnDAO", () => ({
  AgentTurnDAO: jest.fn(() => ({})),
}));
jest.mock("../../../persistence/agentSession/AgentPendingRequestDAO", () => ({
  AgentPendingRequestDAO: jest.fn(() => ({})),
}));
jest.mock("../../../services/TicketPhaseDocumentService", () => ({
  TicketPhaseDocumentService: jest.fn(() => ({})),
}));

import { ChatSessionBridgeService } from "../../../chat/ChatSessionBridgeService";

let sequence = 0;
function event(eventType: AgentSessionEventType, payloadJson: AgentSessionEvent["payloadJson"] = {}): AgentSessionEvent {
  sequence += 1;
  return {
    id: `event-${sequence}`,
    sessionId: "session-1",
    turnId: null,
    jobId: null,
    sequence,
    eventType,
    payloadJson,
    userId: null,
    createdAt: new Date(),
  };
}

function fakeThread() {
  const post = jest.fn().mockResolvedValue(undefined);
  const thread: Pick<Thread, "post" | "unsubscribe"> = {
    post,
    unsubscribe: jest.fn().mockResolvedValue(undefined),
  };
  return { post, thread };
}

describe("ChatSessionBridgeService", () => {
  let bridge: ChatSessionBridgeService;

  beforeEach(() => {
    jest.useFakeTimers();
    sequence = 0;
    mockListBySession.mockReset();
    bridge = new ChatSessionBridgeService();
  });

  afterEach(() => {
    bridge.stopBridge("session-1");
    jest.useRealTimers();
  });

  it("posts the agent's streamed reply as one message, even across polls", async () => {
    const { post, thread } = fakeThread();
    mockListBySession
      .mockResolvedValueOnce([
        event("turn_started"),
        event("assistant_message", { text: "The repo" }),
        event("assistant_message", { text: " uses Vite" }),
      ])
      .mockResolvedValueOnce([
        event("assistant_message", { text: " and Tailwind." }),
        event("turn_completed"),
      ])
      .mockResolvedValue([]);

    bridge.startBridge("session-1", thread as Thread);
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(2000);

    const posted = post.mock.calls.map(([message]) => message);
    expect(posted).toEqual([
      { markdown: "_Agent is working..._" },
      { markdown: "The repo uses Vite and Tailwind." },
    ]);
  });

  it("posts text before and after a tool call as separate messages", async () => {
    const { post, thread } = fakeThread();
    mockListBySession
      .mockResolvedValueOnce([
        event("assistant_message", { text: "Reading the README." }),
        event("tool_call_started", { toolName: "read" }),
        event("assistant_message", { text: "It's a Vite app." }),
        event("turn_completed"),
      ])
      .mockResolvedValue([]);

    bridge.startBridge("session-1", thread as Thread);
    await jest.advanceTimersByTimeAsync(0);

    const posted = post.mock.calls.map(([message]) => message);
    expect(posted).toEqual([
      { markdown: "Reading the README." },
      { markdown: "It's a Vite app." },
    ]);
  });
});
