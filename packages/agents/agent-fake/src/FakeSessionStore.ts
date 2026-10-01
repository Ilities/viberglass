import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/**
 * The fake agent's sessions, one file each in its state directory (the
 * plugin's `stateDirs`), which the worker archives after a turn and restores
 * before the next.
 */
export class FakeSessionStore {
  constructor(private readonly dir: string = path.join(os.homedir(), ".fake", "sessions")) {}

  exists(sessionId: string): boolean {
    return fs.existsSync(this.file(sessionId));
  }

  create(sessionId: string): void {
    fs.mkdirSync(this.dir, { recursive: true });
    this.write(sessionId, 0);
  }

  /** Counts a turn in the session; returns its number, from 1. A session loaded without state starts over. */
  recordTurn(sessionId: string): number {
    const turn = this.turnsSoFar(sessionId) + 1;
    fs.mkdirSync(this.dir, { recursive: true });
    this.write(sessionId, turn);
    return turn;
  }

  private turnsSoFar(sessionId: string): number {
    if (!this.exists(sessionId)) return 0;
    const parsed: unknown = JSON.parse(fs.readFileSync(this.file(sessionId), "utf-8"));
    return typeof parsed === "object" && parsed !== null && "turns" in parsed && typeof parsed.turns === "number" ? parsed.turns : 0;
  }

  private write(sessionId: string, turns: number): void {
    fs.writeFileSync(this.file(sessionId), JSON.stringify({ turns }), "utf-8");
  }

  private file(sessionId: string): string {
    return path.join(this.dir, `${sessionId.replace(/[^A-Za-z0-9_-]/g, "_")}.json`);
  }
}
