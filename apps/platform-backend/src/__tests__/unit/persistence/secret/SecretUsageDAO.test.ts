const rowsByTable: Record<string, unknown[]> = {};

function builder(table: string) {
  const chain = {
    innerJoin: () => chain,
    leftJoin: () => chain,
    select: () => chain,
    where: () => chain,
    execute: async () => rowsByTable[table] ?? [],
  };
  return chain;
}

jest.mock("../../../../persistence/config/database", () => ({
  __esModule: true,
  default: { selectFrom: (table: string) => builder(table) },
}));

import { SecretUsageDAO } from "../../../../persistence/secret/SecretUsageDAO";

const TOKEN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("SecretUsageDAO.listUses", () => {
  it("counts a space that reads a secret through its connection's credential", async () => {
    rowsByTable["project_scm_configs as config"] = [
      { name: "Web shop", directSecretId: null, credentialSecretId: TOKEN },
      { name: "Payments", directSecretId: OTHER, credentialSecretId: null },
      { name: "Docs", directSecretId: TOKEN, credentialSecretId: TOKEN },
    ];
    rowsByTable["integration_credentials as credential"] = [{ name: "GitHub", secretId: TOKEN }];
    rowsByTable["model_endpoints"] = [{ name: "Qwen on Verda", secretId: OTHER }];

    await expect(new SecretUsageDAO().listUses()).resolves.toEqual([
      { secretId: TOKEN, kind: "space", name: "Web shop" },
      { secretId: OTHER, kind: "space", name: "Payments" },
      { secretId: TOKEN, kind: "space", name: "Docs" },
      { secretId: TOKEN, kind: "connection", name: "GitHub" },
      { secretId: OTHER, kind: "model_endpoint", name: "Qwen on Verda" },
    ]);
  });
});
