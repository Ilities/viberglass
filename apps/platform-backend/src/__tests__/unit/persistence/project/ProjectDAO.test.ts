const executeTakeFirstOrThrow = jest.fn();
const returningAll = jest.fn(() => ({ executeTakeFirstOrThrow }));
const where = jest.fn(() => ({ returningAll }));
const set = jest.fn(() => ({ where }));
const mockDb = { updateTable: jest.fn(() => ({ set })) };

jest.mock("../../../../persistence/config/database", () => ({
  __esModule: true,
  default: mockDb,
}));

import { ProjectDAO } from "../../../../persistence/project/ProjectDAO";

describe("ProjectDAO archival", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    executeTakeFirstOrThrow.mockResolvedValue({
      id: "project-1",
      name: "Shop",
      slug: "shop",
      ticket_system: "custom",
      credentials: null,
      webhook_url: null,
      auto_fix_enabled: false,
      auto_fix_tags: [],
      custom_field_mappings: {},
      repository_url: null,
      repository_urls: [],
      agent_instructions: null,
      primary_ticketing_integration_id: null,
      primary_scm_integration_id: null,
      archived_at: new Date("2026-07-22T10:00:00.000Z"),
      created_at: new Date("2026-07-20T10:00:00.000Z"),
      updated_at: new Date("2026-07-22T10:00:00.000Z"),
    });
  });

  it("archives without deleting the project", async () => {
    const project = await new ProjectDAO().archiveProject("project-1");

    expect(mockDb.updateTable).toHaveBeenCalledWith("projects");
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ archived_at: expect.any(Date), updated_at: expect.any(Date) }),
    );
    expect(where).toHaveBeenCalledWith("id", "=", "project-1");
    expect(project.archivedAt).toBe("2026-07-22T10:00:00.000Z");
  });
});
