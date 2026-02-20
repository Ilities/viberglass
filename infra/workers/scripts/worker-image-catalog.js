#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const CATALOG_PATH = path.resolve(
  __dirname,
  "../../../packages/types/src/workerImageCatalog.json",
);

process.stdout.on("error", (error) => {
  if (error.code === "EPIPE") {
    process.exit(0);
  }
  throw error;
});

function readCatalog() {
  const raw = fs.readFileSync(CATALOG_PATH, "utf8");
  return JSON.parse(raw);
}

function shouldInclude(entry, scope) {
  if (scope === "harness") {
    return entry.includeInHarnessSetup === true;
  }

  if (scope === "infra") {
    return entry.includeInInfraProvisioning === true;
  }

  if (scope === "build") {
    return entry.includeInBuildScript === true;
  }

  if (scope === "push") {
    return entry.includeInPushScript === true;
  }

  throw new Error(`Unsupported scope: ${scope}`);
}

function getSharedFields(entry) {
  const dockerfilePath =
    typeof entry.dockerfilePath === "string" ? entry.dockerfilePath : "";
  const isAgentImage = entry.isAgentImage === true ? "1" : "0";

  return { dockerfilePath, isAgentImage };
}

function formatRow(entry, scope) {
  const { dockerfilePath, isAgentImage } = getSharedFields(entry);

  if (scope === "build" || scope === "push") {
    if (typeof entry.scriptImageName !== "string" || !entry.scriptImageName) {
      throw new Error(
        `Catalog entry for variant '${entry.variant}' is missing scriptImageName`,
      );
    }

    return `${entry.variant}\t${entry.scriptImageName}\t${dockerfilePath}\t${isAgentImage}\n`;
  }

  return `${entry.variant}\t${entry.repositoryName}\t${dockerfilePath}\t${isAgentImage}\n`;
}

function printUsage() {
  process.stderr.write(
    "Usage: worker-image-catalog.js list <harness|infra|build|push>\n",
  );
}

function main() {
  const command = process.argv[2];
  const scope = process.argv[3];

  if (command !== "list" || !scope) {
    printUsage();
    process.exit(1);
  }

  const catalog = readCatalog();

  for (const entry of catalog) {
    if (!shouldInclude(entry, scope)) {
      continue;
    }

    process.stdout.write(formatRow(entry, scope));
  }
}

main();
