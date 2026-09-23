import * as fs from "fs";
import * as path from "path";
import { planFakeTurn, renderFakeDocument } from "./fakeTurnPlan";

export interface FakeTurnIo {
  writeFile(filePath: string, contents: string): Promise<void>;
  sleep(ms: number): Promise<void>;
}

const nodeIo: FakeTurnIo = {
  writeFile: (filePath, contents) =>
    fs.promises.writeFile(filePath, contents, "utf-8"),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * Runs one fake agent turn in a repository: optionally waits, then writes the
 * phase document the prompt asks for. Shared by the one-shot CLI path and the
 * ACP server so both behave identically.
 */
export class FakeTurnRunner {
  constructor(private readonly io: FakeTurnIo = nodeIo) {}

  /** @returns The assistant message describing what the turn did. */
  async run(prompt: string, repoDir: string): Promise<string> {
    const plan = planFakeTurn(prompt);

    if (plan.sleepSeconds > 0) {
      await this.io.sleep(plan.sleepSeconds * 1000);
    }

    if (plan.fail) {
      throw new Error("Fake agent failed on request");
    }

    if (!plan.documentFile) {
      return "Fake agent finished without writing a document.";
    }

    await this.io.writeFile(
      path.join(repoDir, plan.documentFile),
      renderFakeDocument(plan.documentFile, prompt),
    );
    return `Fake agent wrote ${plan.documentFile}.`;
  }
}
