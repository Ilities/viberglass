import { SpaceStoragePurge } from "../../../../services/spaces/SpaceStoragePurge";
import type { SpaceHoldings } from "../../../../persistence/project/SpaceDeletionDAO";

const HOLDINGS: SpaceHoldings = {
  runIds: ["job_1"],
  activeRunIds: [],
  taskIds: ["task-1"],
  sessionIds: ["session-1"],
  media: [{ id: "media-1", url: "s3://uploads/ticket-media/screenshots/media-1.png" }],
};

function build(bucket: string) {
  const storage = { delete: jest.fn(async (_prefix: string) => undefined) };
  const media = { deleteFileByStorageUrl: jest.fn(async (_url: string) => undefined) };
  return { purge: new SpaceStoragePurge(storage, media, () => bucket), storage, media };
}

describe("SpaceStoragePurge", () => {
  it("erases the space's objects and those kept for its tasks, sessions, runs and media", async () => {
    const { purge, storage, media } = build("uploads");

    await purge.purge("space-1", HOLDINGS);

    expect(media.deleteFileByStorageUrl).toHaveBeenCalledWith("s3://uploads/ticket-media/screenshots/media-1.png");
    expect(storage.delete.mock.calls.map(([prefix]) => prefix).sort()).toEqual([
      "s3://uploads/conversation-state/job_1/",
      "s3://uploads/conversation-state/session-1/",
      "s3://uploads/jobs/job_1/",
      "s3://uploads/spaces/space-1/",
      "s3://uploads/ticket-phase-docs/task-1/",
    ]);
  });

  it("still removes media kept on disk when no bucket is configured", async () => {
    const { purge, storage, media } = build("");

    await purge.purge("space-1", HOLDINGS);

    expect(media.deleteFileByStorageUrl).toHaveBeenCalledTimes(1);
    expect(storage.delete).not.toHaveBeenCalled();
  });
});
