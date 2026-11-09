import { promises as fs } from "fs";
import path from "path";
import { MANIFEST_FILE, tableFile, type BundleManifest } from "../bundle/bundleManifest";
import type { Row } from "../bundle/jsonValues";
import { bundlePath } from "./ObjectExporter";

/**
 * Builds a bundle in a working directory next to its destination and moves it
 * into place only once it is complete and has passed the scan.
 */
export class BundleWriter {
  readonly workDirectory: string;

  constructor(private readonly directory: string) {
    this.workDirectory = `${directory}.partial`;
  }

  async start(): Promise<void> {
    if (await exists(this.directory)) throw new Error(`${this.directory} already exists; remove it or pick another directory`);
    await fs.rm(this.workDirectory, { recursive: true, force: true });
    await fs.mkdir(path.join(this.workDirectory, "tables"), { recursive: true });
  }

  async readObject(file: string): Promise<Buffer> {
    return fs.readFile(bundlePath(this.workDirectory, file));
  }

  async finish(tables: ReadonlyMap<string, readonly Row[]>, manifest: BundleManifest): Promise<void> {
    for (const [table, rows] of tables) {
      await fs.writeFile(bundlePath(this.workDirectory, tableFile(table)), `${JSON.stringify(rows, null, 1)}\n`);
    }
    await fs.writeFile(path.join(this.workDirectory, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
    await fs.rename(this.workDirectory, this.directory);
  }

  async abandon(): Promise<void> {
    await fs.rm(this.workDirectory, { recursive: true, force: true });
  }
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}
