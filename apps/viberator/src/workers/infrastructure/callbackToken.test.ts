import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { loadCallbackToken } from "./callbackToken";

it("loads a mounted token while preserving older environment-based workers", () => {
  const directory = mkdtempSync(join(tmpdir(), "callback-token-"));
  try {
    const path = join(directory, "token");
    writeFileSync(path, "private-token\n");
    expect(loadCallbackToken({ CALLBACK_TOKEN_FILE: path, CALLBACK_TOKEN: "old-token" })).toBe("private-token");
    expect(loadCallbackToken({ CALLBACK_TOKEN: "old-token" })).toBe("old-token");
    expect(loadCallbackToken({})).toBeUndefined();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

it("fails when a configured token mount is absent", () => {
  expect(() => loadCallbackToken({ CALLBACK_TOKEN_FILE: "/missing/run-secret", CALLBACK_TOKEN: "fallback" })).toThrow();
});
