import { JobService } from "../../../services/JobService";

const mockExecute = jest.fn();
const mockWhere = jest.fn();
const mockSet = jest.fn();
const mockSelect = jest.fn();
jest.mock("../../../persistence/config/database", () => ({
  __esModule: true,
  default: {
    updateTable: jest.fn(() => ({ set: mockSet })),
    selectFrom: (...args: unknown[]) => mockSelect(...args),
  },
}));

describe("Job status reconciliation", () => {
  it("does not overwrite a run that ended after the reconciler read it", async () => {
    const query = { where: mockWhere, executeTakeFirst: mockExecute };
    mockSet.mockReturnValue(query);
    mockWhere.mockReturnValue(query);
    mockExecute.mockResolvedValue({ numUpdatedRows: 0n });

    await new JobService().updateJobStatus("job-1", "failed", {
      expectedStatus: "active",
      errorMessage: "Worker disappeared",
    });

    expect(mockWhere).toHaveBeenCalledWith("status", "=", "active");
    expect(mockSelect).not.toHaveBeenCalled();
  });
});
