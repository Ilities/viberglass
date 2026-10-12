import express from "express";
import request from "supertest";

const mockChatBot: { refresh: jest.Mock; adapterNames: string[]; bot: { webhooks: Record<string, jest.Mock> } } = {
  refresh: jest.fn(),
  adapterNames: [],
  bot: { webhooks: {} },
};

jest.mock("../../../../../chat", () => ({ chatBot: mockChatBot }));

import { createChatRoutes } from "../../../../../api/routes/webhooks/chat.routes";
import { fakeChatProvider } from "../../../../helpers/fakeChatProvider";

function app() {
  const server = express();
  server.use(express.json());
  server.use("/api/webhooks", createChatRoutes(() => [{ system: "chat-app", label: "Chat app", provider: fakeChatProvider({ adapterName: "chat-app" }) }]));
  return server;
}

describe("chat webhook route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChatBot.adapterNames = [];
    mockChatBot.bot.webhooks = {};
  });

  it("leaves addresses that name no chat service to other routes", async () => {
    const response = await request(app()).post("/api/webhooks/configs").send({});
    expect(response.status).toBe(404);
    expect(mockChatBot.refresh).not.toHaveBeenCalled();
  });

  it("answers 503 for a chat service without a working connection", async () => {
    mockChatBot.refresh.mockResolvedValue(undefined);
    const response = await request(app()).post("/api/webhooks/chat-app").send({});
    expect(response.status).toBe(503);
  });

  it("catches up with a connection saved elsewhere before handing the event to the new bot", async () => {
    const handle = jest.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    mockChatBot.refresh.mockImplementation(async () => {
      mockChatBot.adapterNames = ["chat-app"];
      mockChatBot.bot.webhooks = { "chat-app": handle };
    });

    const response = await request(app()).post("/api/webhooks/chat-app").send({ type: "event" });

    expect(response.status).toBe(200);
    expect(response.text).toBe("ok");
    expect(handle).toHaveBeenCalledTimes(1);
  });
});
