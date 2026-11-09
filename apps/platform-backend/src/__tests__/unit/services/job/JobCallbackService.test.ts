const executeTakeFirst = jest.fn();
const where = jest.fn(() => ({ executeTakeFirst }));
const select = jest.fn(() => ({ where }));
const mockDb = { selectFrom: jest.fn(() => ({ select })) };

jest.mock("../../../../persistence/config/database", () => ({
  __esModule: true,
  default: mockDb,
}));

import { callbackTokensMatch, validateCallbackToken } from "../../../../services/job/JobCallbackService";

const TOKEN = "a".repeat(64);

describe("JobCallbackService", () => {
  beforeEach(() => jest.clearAllMocks());

  it("accepts the job's own token", async () => {
    executeTakeFirst.mockResolvedValue({ callback_token: TOKEN });

    await expect(validateCallbackToken("job-1", TOKEN)).resolves.toBe(true);
    expect(where).toHaveBeenCalledWith("id", "=", "job-1");
  });

  it("refuses another token, an empty one and a job that doesn't exist", async () => {
    executeTakeFirst.mockResolvedValue({ callback_token: TOKEN });
    await expect(validateCallbackToken("job-1", "b".repeat(64))).resolves.toBe(false);
    await expect(validateCallbackToken("job-1", "")).resolves.toBe(false);

    executeTakeFirst.mockResolvedValue(undefined);
    await expect(validateCallbackToken("job-2", TOKEN)).resolves.toBe(false);
  });

  it("compares tokens of different lengths without throwing", () => {
    expect(callbackTokensMatch(TOKEN, "short")).toBe(false);
    expect(callbackTokensMatch(TOKEN, `${TOKEN}x`)).toBe(false);
    expect(callbackTokensMatch(null, TOKEN)).toBe(false);
    expect(callbackTokensMatch(TOKEN, TOKEN)).toBe(true);
  });
});
