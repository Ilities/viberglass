import { WebhookConfigDAO } from "../../../../persistence/webhook/WebhookConfigDAO";
import db from "../../../../persistence/config/database";

jest.mock("../../../../persistence/config/database", () => ({
  __esModule: true,
  default: {
    selectFrom: jest.fn(),
  },
}));

const mockDb = db as unknown as {
  selectFrom: jest.Mock;
};

describe("WebhookConfigDAO", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("gets config by integration and config id with direction filter", async () => {
    const row = {
      id: "cfg-1",
      project_id: "project-1",
      provider: "github",
      direction: "inbound",
      provider_project_id: "owner/repo",
      integration_id: "integration-1",
      secret_location: "database",
      secret_path: null,
      webhook_secret_encrypted: "secret",
      api_token_encrypted: null,
      allowed_events: ["issues"],
      auto_execute: false,
      bot_username: null,
      label_mappings: {},
      active: true,
      created_at: new Date("2026-02-09T00:00:00.000Z"),
      updated_at: new Date("2026-02-09T00:00:00.000Z"),
    };

    const executeTakeFirst = jest.fn().mockResolvedValue(row);
    const whereDirection = jest.fn(() => ({ executeTakeFirst }));
    const whereId = jest.fn(() => ({ where: whereDirection }));
    const whereIntegration = jest.fn(() => ({ where: whereId }));
    const selectAll = jest.fn(() => ({ where: whereIntegration }));
    mockDb.selectFrom.mockReturnValue({ selectAll });

    const dao = new WebhookConfigDAO();
    const config = await dao.getByIntegrationAndConfigId(
      "integration-1",
      "cfg-1",
      { direction: "inbound" },
    );

    expect(whereIntegration).toHaveBeenCalledWith(
      "integration_id",
      "=",
      "integration-1",
    );
    expect(whereId).toHaveBeenCalledWith("id", "=", "cfg-1");
    expect(whereDirection).toHaveBeenCalledWith("direction", "=", "inbound");
    expect(config).toMatchObject({
      id: "cfg-1",
      integrationId: "integration-1",
      direction: "inbound",
    });
  });
});
