import { Readable } from "node:stream";
import type { AppHomeStatus, Project, SpaceBackingKind } from "@viberglass/types";
import type { EjectedApp } from "../../../../persistence/apps/SpaceBackingDAO";
import { SpaceBackingView } from "../../../../services/apps/SpaceBackingView";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const EJECTED: EjectedApp = { ejectedAt: new Date("2026-11-05T12:00:00Z"), backupId: "b-1", copyBytes: 4096 };
const READY: AppHomeStatus = { home: { integrationId: "i-1", credentialId: null, owner: "acme" }, availability: { available: true, missing: [] } };

function project(backingKind: SpaceBackingKind, slug = "laptops"): Project {
  return {
    backingKind,
    id: "space-1",
    name: "Laptops",
    slug,
    ticketSystem: "custom",
    credentials: { type: "token" },
    autoFixEnabled: false,
    autoFixTags: [],
    customFieldMappings: {},
    isPrivate: false,
    keyPrefix: "LAP",
    defaultReviewerIds: [],
    questionReminderHours: 4,
    createdAt: "",
    updatedAt: "",
  };
}

function build(space: Project | null = project("git")) {
  const store = { bucket: () => "uploads", open: jest.fn(async () => Readable.from([])) };
  const backing = { ejected: jest.fn(async (): Promise<EjectedApp | null> => EJECTED) };
  const view = new SpaceBackingView({ getProject: jest.fn(async () => space) }, { status: jest.fn(async () => READY) }, backing, store, 30);
  return { view, store, backing };
}

describe("SpaceBackingView", () => {
  it("offers bringing in, and the last copy kept until the backups go", async () => {
    await expect(build().view.options("space-1")).resolves.toEqual({
      appSpacesAvailable: true,
      nameFitsApp: true,
      appNameRule: expect.any(String),
      ejected: { ejectedAt: "2026-11-05T12:00:00.000Z", bytes: 4096, keptUntil: "2026-12-05T12:00:00.000Z" },
      keepDays: 30,
    });
  });

  it("says when the space's name can't be an app's address", async () => {
    await expect(build(project("git", "preview-tools")).view.options("space-1")).resolves.toMatchObject({ nameFitsApp: false });
  });

  it("opens the last copy of an ejected app's data", async () => {
    const { view, store } = build();

    await expect(view.openLastCopy("space-1")).resolves.toMatchObject({ filename: "laptops-app-data.db" });
    expect(store.open).toHaveBeenCalledWith("s3://uploads/spaces/space-1/ejected/b-1/app.db");
  });

  it("has nothing to download once the space hosts its app again, or when the app had no data", async () => {
    await expect(build(project("app")).view.openLastCopy("space-1")).rejects.toMatchObject({ code: "NO_LAST_COPY" });
    const empty = build();
    empty.backing.ejected.mockResolvedValue({ ...EJECTED, copyBytes: null });
    await expect(empty.view.openLastCopy("space-1")).rejects.toMatchObject({ code: "NO_LAST_COPY" });
  });
});
