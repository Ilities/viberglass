import { WebhookDeliveryDAO } from "../../../../persistence/webhook/WebhookDeliveryDAO";
import db from "../../../../persistence/config/database";

jest.mock("../../../../persistence/config/database", () => ({
  __esModule: true,
  default: {
    selectFrom: jest.fn(),
    insertInto: jest.fn(),
    updateTable: jest.fn(),
  },
}));

const mockDb = db as unknown as {
  selectFrom: jest.Mock;
  insertInto: jest.Mock;
  updateTable: jest.Mock;
};

describe("WebhookDeliveryDAO", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("records delivery attempts with webhook_config_id", async () => {
    const now = new Date("2026-02-09T00:00:00.000Z");
    const row = {
      id: "delivery-row-1",
      provider: "github",
      webhook_config_id: "cfg-1",
      delivery_id: "delivery-1",
      event_type: "issues",
      status: "processing",
      error_message: null,
      payload: { title: "Issue" },
      project_id: null,
      ticket_id: null,
      created_at: now,
      processed_at: null,
    };

    const executeTakeFirstOrThrow = jest.fn().mockResolvedValue(row);
    const returningAll = jest.fn(() => ({ executeTakeFirstOrThrow }));
    const values = jest.fn(() => ({ returningAll }));
    mockDb.insertInto.mockReturnValue({ values });

    const dao = new WebhookDeliveryDAO();
    const result = await dao.recordDeliveryAttempt({
      provider: "github",
      webhookConfigId: "cfg-1",
      deliveryId: "delivery-1",
      eventType: "issues",
      payload: { title: "Issue" },
    });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "github",
        webhook_config_id: "cfg-1",
        delivery_id: "delivery-1",
      }),
    );
    expect(result.webhookConfigId).toBe("cfg-1");
  });

  it("lists deliveries for a specific webhook config", async () => {
    const now = new Date("2026-02-09T00:00:00.000Z");
    const rows = [
      {
        id: "delivery-row-1",
        provider: "jira",
        webhook_config_id: "cfg-9",
        delivery_id: "delivery-9",
        event_type: "issue_updated",
        status: "failed",
        error_message: "boom",
        payload: { issue: "ABC-1" },
        project_id: "project-1",
        ticket_id: null,
        created_at: now,
        processed_at: now,
      },
    ];

    const execute = jest.fn().mockResolvedValue(rows);
    const offset = jest.fn(() => ({ execute }));
    const limit = jest.fn(() => ({ offset }));
    const orderBy = jest.fn(() => ({ limit }));
    const whereStatus = jest.fn(() => ({ orderBy }));
    const whereConfig = jest.fn(() => ({ where: whereStatus }));
    const selectAll = jest.fn(() => ({ where: whereConfig }));
    mockDb.selectFrom.mockReturnValue({ selectAll });

    const dao = new WebhookDeliveryDAO();
    const result = await dao.listDeliveriesByConfig("cfg-9", {
      statuses: ["failed"],
      limit: 25,
      offset: 5,
    });

    expect(whereConfig).toHaveBeenCalledWith("webhook_config_id", "=", "cfg-9");
    expect(whereStatus).toHaveBeenCalledWith("status", "in", ["failed"]);
    expect(orderBy).toHaveBeenCalledWith("created_at", "desc");
    expect(result[0]).toMatchObject({
      id: "delivery-row-1",
      webhookConfigId: "cfg-9",
      status: "failed",
    });
  });

  it("gets a retry candidate by internal id scoped to webhook config", async () => {
    const now = new Date("2026-02-09T00:00:00.000Z");
    const row = {
      id: "delivery-row-2",
      provider: "custom",
      webhook_config_id: "cfg-custom",
      delivery_id: "delivery-2",
      event_type: "ticket_created",
      status: "failed",
      error_message: "invalid payload",
      payload: { title: "Bug" },
      project_id: "project-2",
      ticket_id: null,
      created_at: now,
      processed_at: now,
    };

    const executeTakeFirst = jest.fn().mockResolvedValue(row);
    const whereConfig = jest.fn(() => ({ executeTakeFirst }));
    const whereId = jest.fn(() => ({ where: whereConfig }));
    const selectAll = jest.fn(() => ({ where: whereId }));
    mockDb.selectFrom.mockReturnValue({ selectAll });

    const dao = new WebhookDeliveryDAO();
    const result = await dao.getDeliveryByIdForConfig(
      "delivery-row-2",
      "cfg-custom",
    );

    expect(whereId).toHaveBeenCalledWith("id", "=", "delivery-row-2");
    expect(whereConfig).toHaveBeenCalledWith(
      "webhook_config_id",
      "=",
      "cfg-custom",
    );
    expect(result?.webhookConfigId).toBe("cfg-custom");
  });
});
