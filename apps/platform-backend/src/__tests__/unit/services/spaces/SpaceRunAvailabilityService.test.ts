import type { Project, SpaceBackingKind } from "@viberglass/types";
import { SpaceRunAvailabilityService } from "../../../../services/spaces/SpaceRunAvailabilityService";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

function space(backingKind: SpaceBackingKind): Project {
  return { id: "space", name: "Space", slug: "space", backingKind, ticketSystem: "native", credentials: { type: "token" }, autoFixEnabled: false, autoFixTags: [], customFieldMappings: {}, isPrivate: false, keyPrefix: "SPA", defaultReviewerIds: [], questionReminderHours: 4, createdAt: "", updatedAt: "" };
}

describe("SpaceRunAvailabilityService", () => {
  it.each(["git", "files"] as const)("tells a %s space's backing", async (backing) => {
    const service = new SpaceRunAvailabilityService({ getProject: async () => space(backing) });
    await expect(service.backingOf("space")).resolves.toBe(backing);
  });

  it("reports a missing space as not found", async () => {
    const service = new SpaceRunAvailabilityService({ getProject: async () => null });
    await expect(service.backingOf("space")).rejects.toMatchObject({ code: "SPACE_NOT_FOUND", statusCode: 404 });
  });
});
