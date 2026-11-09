const adminOnly = jest.fn();

jest.mock("../../../../chat", () => ({ chatBotStatus: { status: jest.fn() } }));
jest.mock("../../../../api/middleware/authentication", () => ({
  requireAuth: jest.fn(),
  requireRole: jest.fn(() => adminOnly),
}));
jest.mock("../../../../webhooks/webhookServiceFactory", () => ({ getWebhookService: jest.fn() }));

import integrationsRouter from "../../../../api/routes/integrations";

function readHandlers(path: string): unknown[] {
  const layer = integrationsRouter.stack.find((entry) => entry.route?.path === path && entry.route.stack.some((step) => step.method === "get"));
  if (!layer?.route) throw new Error(`No GET ${path}`);
  return layer.route.stack.map((step) => step.handle);
}

describe("integration reads", () => {
  it.each(["/:id", "/:system/chat-status", "/:id/credentials/:credentialId", "/:id/webhooks/inbound/:configId/deliveries"])(
    "keeps GET %s to admins",
    (path) => {
      expect(readHandlers(path)).toContain(adminOnly);
    },
  );

  it.each(["/", "/types/available", "/space/:projectId", "/:id/credentials", "/:id/webhooks/inbound", "/:id/repository-owners"])(
    "leaves GET %s to the mount's guard, which lets members read",
    (path) => {
      expect(readHandlers(path)).not.toContain(adminOnly);
    },
  );
});
