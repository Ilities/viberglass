import { InvalidRunRecordCursorError, RunRecordService } from "../../../../services/runRecords/RunRecordService";
import { runRecordRow } from "./runRecordFixtures";

describe("RunRecordService", () => {
  const dao = { listPage: jest.fn(), getByJobId: jest.fn() };
  const service = new RunRecordService(dao);

  beforeEach(() => jest.resetAllMocks());

  it("asks for one extra row and returns a cursor when there is another page", async () => {
    const last = runRecordRow({ job_id: "job-2", dispatched_at: new Date("2026-09-29T00:00:00.000Z") });
    dao.listPage.mockResolvedValue([runRecordRow(), last, runRecordRow({ job_id: "job-3" })]);

    const page = await service.list(undefined, 2);

    expect(dao.listPage).toHaveBeenCalledWith(null, 3);
    expect(page.records.map((record) => record.jobId)).toEqual(["job-1", "job-2"]);
    expect(page.nextCursor).not.toBeNull();

    dao.listPage.mockResolvedValue([]);
    await service.list(page.nextCursor ?? undefined, 2);
    expect(dao.listPage).toHaveBeenLastCalledWith(
      { dispatchedAt: new Date("2026-09-29T00:00:00.000Z"), jobId: "job-2" },
      3,
    );
  });

  it("returns no cursor on the last page", async () => {
    dao.listPage.mockResolvedValue([runRecordRow()]);

    await expect(service.list(undefined, 2)).resolves.toMatchObject({ nextCursor: null });
  });

  it.each(["not-base64-json", Buffer.from('{"d":"nope","j":"x"}').toString("base64url"), Buffer.from("[]").toString("base64url")])(
    "rejects the cursor %s",
    async (cursor) => {
      await expect(service.list(cursor, 2)).rejects.toBeInstanceOf(InvalidRunRecordCursorError);
      expect(dao.listPage).not.toHaveBeenCalled();
    },
  );

  it("returns null for a run without a record", async () => {
    dao.getByJobId.mockResolvedValue(undefined);

    await expect(service.get("job-9")).resolves.toBeNull();
  });
});
