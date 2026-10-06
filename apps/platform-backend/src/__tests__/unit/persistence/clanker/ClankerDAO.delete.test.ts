const execute = jest.fn();
const mockQuery = {
  leftJoin: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  offset: jest.fn().mockReturnThis(),
  executeTakeFirst: jest.fn(async () => undefined),
  selectAll: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
  execute,
};
const mockDb = {
  selectFrom: jest.fn(() => mockQuery),
  deleteFrom: jest.fn(() => mockQuery),
  updateTable: jest.fn(() => mockQuery),
};
jest.mock("../../../../persistence/config/database", () => ({
  __esModule: true,
  default: mockDb,
}));
const mockDeleteInstruction = jest.fn();
jest.mock(
  "../../../../services/instructions/InstructionStorageService",
  () => ({
    InstructionStorageService: jest.fn(() => ({
      deleteInstruction: mockDeleteInstruction,
    })),
  }),
);
jest.mock("../../../../persistence/clanker/ClankerToolsDAO", () => ({
  ClankerToolsDAO: jest.fn(() => ({
    getForClankers: jest.fn(async () => new Map()),
  })),
}));
import { ClankerDAO } from "../../../../persistence/clanker/ClankerDAO";

it("removes the runner from use without deleting its referenced history or instruction files", async () => {
  execute.mockResolvedValue([]);
  await new ClankerDAO().deleteClanker("runner-id");
  expect(mockDb.deleteFrom).not.toHaveBeenCalled();
  expect(mockDb.updateTable).toHaveBeenCalledWith("clankers");
  expect(mockQuery.set).toHaveBeenCalledWith(
    expect.objectContaining({
      deleted_at: expect.any(Date),
      status: "inactive",
    }),
  );
  expect(mockQuery.where).toHaveBeenCalledWith("id", "=", "runner-id");
  expect(mockDeleteInstruction).not.toHaveBeenCalled();
});

beforeEach(() => jest.clearAllMocks());

it("filters deleted runners from ID and slug lookups", async () => {
  const dao = new ClankerDAO();
  expect(await dao.getClanker("runner-id")).toBeNull();
  expect(await dao.getClankerBySlug("pi")).toBeNull();
  expect(mockQuery.where).toHaveBeenCalledWith(
    "clankers.deleted_at",
    "is",
    null,
  );
  expect(
    mockQuery.where.mock.calls.filter(
      (call) => call[0] === "clankers.deleted_at",
    ),
  ).toHaveLength(2);
});

it("filters deleted runners from available runner lists", async () => {
  execute.mockResolvedValue([]);
  expect(await new ClankerDAO().listClankers()).toEqual([]);
  expect(mockQuery.where).toHaveBeenCalledWith(
    "clankers.deleted_at",
    "is",
    null,
  );
});
