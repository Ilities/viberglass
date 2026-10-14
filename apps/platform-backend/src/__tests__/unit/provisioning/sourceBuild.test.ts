import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { WORKER_DOCKERFILE_PATH } from "../../../provisioning/shared/repoRoot";
import {
  buildsDockerImageFromSource,
  canBuildWorkerFromSource,
} from "../../../provisioning/shared/sourceBuild";

describe("canBuildWorkerFromSource", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), "source-build-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("is false without the worker Dockerfile", () => {
    expect(canBuildWorkerFromSource(root)).toBe(false);
  });

  it("is true when the worker Dockerfile is under the root", () => {
    const dockerfile = path.join(root, WORKER_DOCKERFILE_PATH);
    mkdirSync(path.dirname(dockerfile), { recursive: true });
    writeFileSync(dockerfile, "FROM scratch\n");
    expect(canBuildWorkerFromSource(root)).toBe(true);
  });
});

describe("buildsDockerImageFromSource", () => {
  const config = (strategy: Record<string, unknown>) => ({
    version: 1,
    strategy,
    agent: { type: "claude-code" },
  });

  it.each([
    ["managed Docker", config({ type: "docker", provisioningMode: "managed" }), true],
    ["Docker without a mode", config({ type: "docker" }), true],
    ["published Docker image", config({ type: "docker", provisioningMode: "prebuilt" }), false],
    ["managed ECS", config({ type: "ecs", provisioningMode: "managed" }), false],
    ["no config", undefined, false],
  ])("%s", (_name, deploymentConfig, expected) => {
    expect(buildsDockerImageFromSource(deploymentConfig)).toBe(expected);
  });
});
