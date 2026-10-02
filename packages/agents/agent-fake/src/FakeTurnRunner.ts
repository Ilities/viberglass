import * as fs from "fs";
import * as path from "path";
import { planFakeTurn, renderFakeDocument, type FakeDocumentFile } from "./fakeTurnPlan";

export interface FakeTurnIo {
  writeFile(filePath: string, contents: string): Promise<void>;
  appendFile(filePath: string, contents: string): Promise<void>;
  exists(filePath: string): boolean;
  sleep(ms: number): Promise<void>;
}

const nodeIo: FakeTurnIo = {
  writeFile: (filePath, contents) => fs.promises.writeFile(filePath, contents, "utf-8"),
  appendFile: (filePath, contents) => fs.promises.appendFile(filePath, contents, "utf-8"),
  exists: (filePath) => fs.existsSync(filePath),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** The file `[fake:code]` changes. */
export const FAKE_CHANGE_FILE = "fake-change.txt";

const DOCUMENT_NAME: Record<FakeDocumentFile, string> = { "RESEARCH.md": "research", "PLAN.md": "plan", "SUMMARY.md": "summary" };

/**
 * Runs one fake agent turn in a repository: optionally waits, then writes the
 * document the prompt asks for and changes code if told to. Shared by the
 * one-shot CLI path and the ACP server so both behave identically.
 */
export class FakeTurnRunner {
  constructor(private readonly io: FakeTurnIo = nodeIo) {}

  /**
   * @param turn Which turn of its session this is, from 1.
   * @returns What the agent says: a first line saying what it's doing, then what it did.
   */
  async run(prompt: string, repoDir: string, turn = 1): Promise<string> {
    const plan = planFakeTurn(prompt);

    if (plan.sleepSeconds > 0) {
      await this.io.sleep(plan.sleepSeconds * 1000);
    }

    if (plan.fail) {
      throw new Error("Fake agent failed on request");
    }

    const intents: string[] = [];
    const done: string[] = [];
    if (plan.documentFile) {
      const documentPath = path.join(repoDir, plan.documentFile);
      const revising = this.io.exists(documentPath);
      intents.push(`${revising ? "Revising" : "Writing"} the ${DOCUMENT_NAME[plan.documentFile]}`);
      await this.io.writeFile(documentPath, renderFakeDocument(plan.documentFile, prompt, turn));
      done.push(`Fake agent wrote ${plan.documentFile}.`);
    }
    if (plan.code) {
      intents.push("Making the change");
      await this.io.appendFile(path.join(repoDir, FAKE_CHANGE_FILE), `Changed by the fake agent on turn ${turn}.\n`);
      done.push(`Fake agent changed ${FAKE_CHANGE_FILE}.`);
    }
    if (intents.length === 0) {
      return `Answering: fake agent, turn ${turn}.\n\nFake agent finished without writing a document.`;
    }
    return `${intents.join(" and ")}: fake agent, turn ${turn}.\n\n${done.join(" ")}`;
  }
}
