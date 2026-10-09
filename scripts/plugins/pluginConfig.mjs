// Reads viberglass.plugins.json, the list of harness and integration packages a build includes.
// Plain JavaScript so build scripts and Dockerfiles can run it with node alone.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const WORKSPACE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const CONFIG_PATH = path.join(WORKSPACE_ROOT, "viberglass.plugins.json");

/** Directory under the workspace root that holds each kind's packages. */
const KIND_DIRS = {
  agents: "packages/agents",
  integrations: "packages/integrations",
};

export const PLUGIN_KINDS = Object.keys(KIND_DIRS);

/**
 * The configured packages of one kind, in config order.
 * @param {"agents" | "integrations"} kind
 * @returns {{ name: string, dir: string }[]} `dir` is relative to the workspace root.
 */
export function readPlugins(kind) {
  const kindDir = KIND_DIRS[kind];
  if (!kindDir) {
    throw new Error(`Unknown plugin kind '${kind}'. Expected one of: ${PLUGIN_KINDS.join(", ")}.`);
  }
  const names = readConfig()[kind] ?? [];
  if (!Array.isArray(names) || names.some((name) => typeof name !== "string")) {
    throw new Error(`'${kind}' in ${CONFIG_PATH} must be a list of package names.`);
  }

  const workspaceDirs = packageDirsByName(kindDir);
  const seen = new Set();
  return names.map((name) => {
    if (seen.has(name)) throw new Error(`${name} is listed twice in ${CONFIG_PATH}.`);
    seen.add(name);
    const dir = workspaceDirs.get(name);
    if (!dir) throw new Error(`${name} in ${CONFIG_PATH} is not a package under ${kindDir}/.`);
    return { name, dir };
  });
}

/** The package of the harness new runners get unless they choose another; one of the configured agents. */
export function readDefaultAgent() {
  const name = readConfig().defaultAgent;
  if (!readPlugins("agents").some((plugin) => plugin.name === name)) {
    throw new Error(`defaultAgent in ${CONFIG_PATH} must be one of its agents, got '${name}'.`);
  }
  return name;
}

function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

function packageDirsByName(kindDir) {
  const dirs = new Map();
  for (const entry of fs.readdirSync(path.join(WORKSPACE_ROOT, kindDir), { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
    const dir = path.posix.join(kindDir, entry.name);
    const manifestPath = path.join(WORKSPACE_ROOT, dir, "package.json");
    if (!fs.existsSync(manifestPath)) continue;
    dirs.set(JSON.parse(fs.readFileSync(manifestPath, "utf8")).name, dir);
  }
  return dirs;
}
