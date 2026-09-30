const execute = jest.fn();
const where = jest.fn(() => ({ execute }));
const set = jest.fn(() => ({ where }));
const values = jest.fn(() => ({ execute }));
const mockDb = {
  updateTable: jest.fn(() => ({ set })),
  insertInto: jest.fn(() => ({ values })),
};

jest.mock("../../../../persistence/config/database", () => ({
  __esModule: true,
  default: mockDb,
}));

import { recordLog, recordLogBatch } from "../../../../services/job/JobProgressService";

describe("JobProgressService log lines", () => {
  beforeEach(() => jest.clearAllMocks());

  it("counts a log batch as a heartbeat, so a long agent step is not given up", async () => {
    await recordLogBatch("job-1", [{ level: "info", message: "[agent:opencode:stdout] …" }]);

    expect(mockDb.updateTable).toHaveBeenCalledWith("jobs");
    expect(set).toHaveBeenCalledWith({ last_heartbeat: expect.any(Date) });
    expect(where).toHaveBeenCalledWith("id", "=", "job-1");
    expect(mockDb.insertInto).toHaveBeenCalledWith("job_log_lines");
  });

  it("counts a single log line as a heartbeat", async () => {
    await recordLog("job-1", { level: "warn", message: "retrying" });

    expect(set).toHaveBeenCalledWith({ last_heartbeat: expect.any(Date) });
    expect(mockDb.insertInto).toHaveBeenCalledWith("job_log_lines");
  });

  it("does nothing for an empty batch", async () => {
    await recordLogBatch("job-1", []);

    expect(mockDb.updateTable).not.toHaveBeenCalled();
    expect(mockDb.insertInto).not.toHaveBeenCalled();
  });
});
