import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import type { SeededWorkspace } from "./seedWorkspace";

export const SEED_FILE = fileURLToPath(new URL("../.e2e-seed.json", import.meta.url));

/** Ids written by globalSetup for the tests to use. */
export function seededWorkspace(): SeededWorkspace {
  return JSON.parse(readFileSync(SEED_FILE, "utf-8"));
}
