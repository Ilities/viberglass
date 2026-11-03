import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { RELEASE_BUILD_LOG_MAX_LENGTH } from "@viberglass/types";

export interface AppBuildOutcome {
  succeeded: boolean;
  /** The tail of what the build printed, stdout and stderr together. */
  log: string;
  reason?: string;
}

const BUILD_TIMEOUT_MS = 20 * 60 * 1000;

/**
 * The build runs the app's own code, so it gets none of the worker's
 * environment: no repository token, callback token or platform settings.
 */
export function buildEnvironment(homeDir: string): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
    HOME: homeDir,
    LANG: "C.UTF-8",
    CI: "true",
    npm_config_update_notifier: "false",
    npm_config_fund: "false",
  };
}

/** Runs the manifest's build command in the repository root. */
export function runAppBuild(command: string, repoDir: string, homeDir: string, timeoutMs = BUILD_TIMEOUT_MS): Promise<AppBuildOutcome> {
  fs.mkdirSync(homeDir, { recursive: true });
  return new Promise((resolve) => {
    let log = "";
    const append = (chunk: Buffer) => {
      log = (log + chunk.toString("utf8")).slice(-RELEASE_BUILD_LOG_MAX_LENGTH);
    };
    const child = spawn("sh", ["-c", command], { cwd: repoDir, env: buildEnvironment(homeDir), stdio: ["ignore", "pipe", "pipe"], detached: true });
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      // The whole process group, so the build's own children stop too.
      if (child.pid) process.kill(-child.pid, "SIGKILL");
    }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ succeeded: false, log, reason: `The build couldn't start: ${error.message}` });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) resolve({ succeeded: false, log, reason: `The build took longer than ${Math.round(timeoutMs / 60000)} minutes` });
      else if (code === 0) resolve({ succeeded: true, log });
      else resolve({ succeeded: false, log, reason: `The build command exited with code ${code}` });
    });
  });
}

export function buildHomeDir(workDir: string): string {
  return path.join(workDir, "build-home");
}
