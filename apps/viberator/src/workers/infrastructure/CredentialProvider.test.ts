import { createLogger } from "winston";
import { CredentialProvider } from "./CredentialProvider";

describe("Bootstrap credential delivery", () => {
  it("uses supplied values and cannot fall back to shared environment credentials", async () => {
    const oldValue = process.env.UNLISTED_KEY;
    process.env.UNLISTED_KEY = "platform-secret";
    try {
      const provider = new CredentialProvider(createLogger({ silent: true }), {
        suppliedCredentials: { AGENT_KEY: "run-secret", CODEX_AUTH: '{"token":"run-auth"}' },
        ssmEnabled: false,
      });
      await expect(provider.getCredential("tenant-1", "AGENT_KEY")).resolves.toBe("run-secret");
      await expect(provider.getCredential("tenant-1", "UNLISTED_KEY")).resolves.toBeUndefined();
      await expect(provider.getCredential("tenant-1", "toString")).resolves.toBeUndefined();
      await expect(provider.getRawSsmValue(provider.getSharedParameterName("CODEX_AUTH"))).resolves.toBe('{"token":"run-auth"}');
      await expect(provider.getRawSsmValue(provider.getSharedParameterName("UNLISTED_KEY"))).resolves.toBeUndefined();
    } finally {
      if (oldValue === undefined) delete process.env.UNLISTED_KEY;
      else process.env.UNLISTED_KEY = oldValue;
    }
  });
});
