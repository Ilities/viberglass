import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appDataPath } from "@viberglass/types";
import { litestreamConfig, restoreEnv, runFile, type Run } from "./AppDataCopier";
import type { AppDataStore } from "./AppDataStore";
import { AppSpaceError } from "./AppSpaceError";

type Env = Record<string, string | undefined>;

export type AppDataSeed =
  | { from: "none" }
  | { from: "last_copy"; backupId: string }
  | { from: "upload"; path: string };


/**
 * Puts the data an app starts with into its replica before its first start:
 * nothing, a backup's copy, or an uploaded SQLite file, which Litestream
 * replicates once from a temporary copy.
 */
export class AppDataSeeder {
  constructor(
    private readonly store: Pick<AppDataStore, "clearReplica" | "restore">,
    private readonly problemWith: (path: string) => string | null,
    private readonly env: () => Env = () => process.env,
    private readonly run: Run = runFile,
  ) {}

  /** Refuses a file that isn't an intact SQLite database before anything is changed. */
  check(seed: AppDataSeed): void {
    if (seed.from !== "upload") return;
    const problem = this.problemWith(seed.path);
    if (problem) throw new AppSpaceError("DATA_FILE_INVALID", problem);
  }

  async seed(projectId: string, seed: AppDataSeed): Promise<void> {
    if (seed.from === "last_copy") {
      await this.store.restore(projectId, seed.backupId);
      return;
    }
    await this.store.clearReplica(projectId);
    if (seed.from === "upload") await this.replicate(projectId, seed.path);
  }

  private async replicate(projectId: string, file: string): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), "viberglass-app-seed-"));
    try {
      const database = join(dir, "app.db");
      const config = join(dir, "litestream.yml");
      await copyFile(file, database);
      await writeFile(config, litestreamConfig(this.env(), database, appDataPath(projectId)), { mode: 0o600 });
      await this.run("litestream", ["replicate", "-config", config, "-no-expand-env", "-once"], restoreEnv(this.env()));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
