const execute = jest.fn();
const where = jest.fn(() => ({ execute }));
const select = jest.fn(() => ({ where }));
const mockDb = { selectFrom: jest.fn(() => ({ select })) };

jest.mock("../../../../persistence/config/database", () => ({
  __esModule: true,
  default: mockDb,
}));

import { ClankerDAO } from "../../../../persistence/clanker/ClankerDAO";

const KEY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const GONE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("ClankerDAO.validateSecretsExist", () => {
  beforeEach(() => jest.clearAllMocks());

  it("accepts one secret bound to several variables", async () => {
    execute.mockResolvedValue([{ id: KEY }]);

    await expect(new ClankerDAO().validateSecretsExist([KEY, KEY])).resolves.toBeUndefined();
    expect(where).toHaveBeenCalledWith("id", "in", [KEY]);
  });

  it("names only the secrets that are really missing", async () => {
    execute.mockResolvedValue([{ id: KEY }]);

    await expect(new ClankerDAO().validateSecretsExist([KEY, GONE, KEY])).rejects.toThrow(
      `A chosen secret no longer exists. Pick another on the runner and save again. (${GONE})`,
    );
  });
});
