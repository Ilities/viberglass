#!/usr/bin/env node
// Writes the worker Dockerfiles for the harnesses in viberglass.plugins.json: one per harness,
// FROM the base worker image plus its Dockerfile.fragment, and the multi-agent, ECS and Lambda
// images, composed from a template in infra/workers/docker/base and the harnesses' fragments.
// Reads the built plugins, so run `npm run build` first.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { readDefaultAgent, readPlugins, WORKSPACE_ROOT } from "./pluginConfig.mjs";

const require = createRequire(import.meta.url);

const DOCKER_DIR = path.join(WORKSPACE_ROOT, "infra/workers/docker");
const GENERATED_DIR = path.join(DOCKER_DIR, "generated");
const MARKER = "# HARNESS INSTALLS";
const REGENERATE = "# Generated: don't edit, run npm run generate:dockerfiles.";

// Debian harness fragments run as the viberator user, with npm installing under its home.
const DEBIAN_HEADER = [
  "ENV NPM_CONFIG_PREFIX=/home/viberator/.npm-global",
  'ENV PATH="/home/viberator/.npm-global/bin:/home/viberator/.local/bin:/home/viberator/.cargo/bin:${PATH}"',
];
const CLI_HELP = 'CMD ["node", "apps/viberator/dist/cli-worker.js", "--help"]';

function loadHarness({ name, dir }) {
  const distPath = path.join(WORKSPACE_ROOT, dir, "dist/index.js");
  if (!fs.existsSync(distPath)) {
    throw new Error(`${name} isn't built (${distPath} is missing). Run "npm run build" first.`);
  }
  const mod = require(distPath);
  const plugin = mod.default ?? mod;
  if (!plugin.docker) throw new Error(`${name} has no docker descriptor.`);
  return { name, dir, id: plugin.id, docker: plugin.docker };
}

function fragment(harness, file) {
  const fragmentPath = path.join(WORKSPACE_ROOT, harness.dir, file);
  if (!fs.existsSync(fragmentPath)) throw new Error(`${harness.name} has no ${file}.`);
  return fs.readFileSync(fragmentPath, "utf8").trim();
}

/** The template's lines before and after its marker, without its leading comment block. */
function splitTemplate(templateFile) {
  const lines = fs.readFileSync(path.join(DOCKER_DIR, templateFile), "utf8").trimEnd().split("\n");
  const marker = lines.indexOf(MARKER);
  if (marker < 0) throw new Error(`${templateFile} has no "${MARKER}" line.`);
  const firstInstruction = lines.findIndex((line) => line.trim() !== "" && !line.startsWith("#"));
  return { before: lines.slice(firstInstruction, marker), after: lines.slice(marker + 1) };
}

function write(file, title, lines) {
  fs.writeFileSync(path.join(DOCKER_DIR, file), [`# ${title}`, REGENERATE, "", ...lines, ""].join("\n"));
  console.log(`Generated ${file}`);
}

function harnessImage(harness) {
  return [
    "ARG BASE_IMAGE=base-worker",
    `FROM \${BASE_IMAGE} AS ${harness.docker.variant}-worker`,
    "",
    ...DEBIAN_HEADER,
    "",
    fragment(harness, "Dockerfile.fragment"),
    "",
    `ENV AGENT_TYPE=${harness.id}`,
    `LABEL agent.type="${harness.id}" viberator.worker-type="agent"`,
    "",
    CLI_HELP,
  ];
}

/** The base worker with the harnesses installed, in one build that needs no base image. */
function debianImage(harnesses, label) {
  const { before, after } = splitTemplate("base/base-worker.Dockerfile");
  return [
    ...before,
    "USER viberator",
    ...DEBIAN_HEADER,
    "",
    ...harnesses.flatMap((harness) => [fragment(harness, "Dockerfile.fragment"), ""]),
    label,
    "USER root",
    ...after,
  ];
}

function lambdaImage(harnesses) {
  const { before, after } = splitTemplate("base/lambda-worker.Dockerfile");
  return [...before, ...harnesses.flatMap((harness) => [fragment(harness, "Dockerfile.lambda.fragment"), ""]), ...after];
}

const harnesses = readPlugins("agents").map(loadHarness);
const shipped = harnesses.filter((harness) => harness.docker.testOnly !== true);
const defaultPackage = readDefaultAgent();
const defaultHarness = harnesses.find((harness) => harness.name === defaultPackage);
const ids = shipped.map((harness) => harness.id).join(",");

// Harnesses left out of the config lose their Dockerfile.
fs.rmSync(GENERATED_DIR, { recursive: true, force: true });
fs.mkdirSync(GENERATED_DIR, { recursive: true });
for (const harness of harnesses) {
  // A plugin naming its own Dockerfile uses a hand-written one instead of a composed one.
  if (harness.docker.dockerfilePath) continue;
  write(`generated/${harness.docker.variant}.Dockerfile`, `Worker image for ${harness.id}`, harnessImage(harness));
}

write(
  "viberator-worker-multi-agent.Dockerfile",
  "Worker image with every harness in the build",
  debianImage(shipped, `LABEL agent.types="${ids}" viberator.worker-type="multi-agent"`),
);
write(
  "viberator-ecs-worker.Dockerfile",
  "ECS worker image, with the build's default harness",
  debianImage([defaultHarness], `LABEL agent.type="${defaultHarness.id}" viberator.worker-type="agent"`),
);
write("viberator-lambda.Dockerfile", "Lambda worker image with every harness in the build", lambdaImage(shipped));
