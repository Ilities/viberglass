import type { Project, SpaceBackingKind } from "@viberglass/types";
import { SpaceRunAvailabilityService } from "../../../../services/spaces/SpaceRunAvailabilityService";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

function space(backingKind: SpaceBackingKind): Project {
  return { id: "space", name: "Space", slug: "space", backingKind, ticketSystem: "native", credentials: { type: "token" }, autoFixEnabled: false, autoFixTags: [], customFieldMappings: {}, isPrivate: false, keyPrefix: "SPA", defaultReviewerIds: [], questionReminderHours: 4, createdAt: "", updatedAt: "" };
}

describe("SpaceRunAvailabilityService", () => {
  it("refuses builds in Files spaces with a readable conflict", async () => {
    const service = new SpaceRunAvailabilityService({ getProject: async () => space("files") });
    await expect(service.assertAvailable("space", "code")).rejects.toMatchObject({ code: "FILES_BUILD_UNAVAILABLE", statusCode: 409, message: expect.stringContaining("instead of opening pull requests") });
  });

  it.each(["plan", "reply", "summarise"] as const)("lets a Files space ask for a %s turn", async (action) => {
    const service = new SpaceRunAvailabilityService({ getProject: async () => space("files") });
    await expect(service.assertAvailable("space", action)).resolves.toBeUndefined();
  });

  it("reports a missing space as not found", async () => {
    const service = new SpaceRunAvailabilityService({ getProject: async () => null });
    await expect(service.assertAvailable("space", "reply")).rejects.toMatchObject({ code: "SPACE_NOT_FOUND", statusCode: 404 });
  });

  it("allows existing Git execution", async () => {
    const service = new SpaceRunAvailabilityService({ getProject: async () => space("git") });
    await expect(service.assertAvailable("space", "code")).resolves.toBeUndefined();
  });
});
