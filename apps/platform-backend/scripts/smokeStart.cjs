#!/usr/bin/env node

const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");

const cwd = path.resolve(__dirname, "..");
const entrypoint = path.join(cwd, "dist", "api", "server.js");
const port = Number(process.env.SMOKE_PORT || "8899");
const startupTimeoutMs = Number(process.env.SMOKE_STARTUP_TIMEOUT_MS || "20000");
const shutdownTimeoutMs = Number(process.env.SMOKE_SHUTDOWN_TIMEOUT_MS || "5000");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForHealthCheck(deadlineMs) {
  return new Promise((resolve, reject) => {
    const tryRequest = () => {
      if (Date.now() > deadlineMs) {
        reject(new Error(`Health endpoint did not become ready within ${startupTimeoutMs}ms`));
        return;
      }

      const req = http.get(
        {
          host: "127.0.0.1",
          port,
          path: "/health",
          timeout: 1000,
        },
        (res) => {
          res.resume();
          if (res.statusCode === 200) {
            resolve();
            return;
          }
          setTimeout(tryRequest, 250);
        },
      );

      req.on("timeout", () => {
        req.destroy();
      });

      req.on("error", () => {
        setTimeout(tryRequest, 250);
      });
    };

    tryRequest();
  });
}

function shutdown(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve();
      return;
    }

    const forceKillTimer = setTimeout(() => {
      child.kill("SIGKILL");
    }, shutdownTimeoutMs);

    child.once("exit", () => {
      clearTimeout(forceKillTimer);
      resolve();
    });

    child.kill("SIGTERM");
  });
}

async function main() {
  const env = {
    ...process.env,
    PORT: String(port),
    HOST: "127.0.0.1",
    NODE_ENV: process.env.NODE_ENV || "test",
    RUN_MIGRATIONS_ON_STARTUP: "false",
    DISABLE_BACKGROUND_SWEEPERS: "true",
  };

  const child = spawn(process.execPath, [entrypoint], {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    stdout += text;
    process.stdout.write(text);
  });

  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    stderr += text;
    process.stderr.write(text);
  });

  try {
    const startedAt = Date.now();
    await waitForHealthCheck(Date.now() + startupTimeoutMs);
    const startedIn = Date.now() - startedAt;
    console.log(`[smoke] backend started and passed /health in ${startedIn}ms`);

    await delay(500);
    await shutdown(child);

    if (child.exitCode !== 0 && child.exitCode !== null) {
      throw new Error(`Server exited with non-zero code after shutdown: ${child.exitCode}`);
    }

    console.log("[smoke] backend startup smoke check passed");
  } catch (error) {
    await shutdown(child);

    const err = error instanceof Error ? error : new Error(String(error));
    console.error(`[smoke] startup smoke check failed: ${err.message}`);

    if (!stdout.trim() && !stderr.trim()) {
      console.error("[smoke] no server output captured");
    }

    process.exit(1);
  }
}

main().catch((error) => {
  const err = error instanceof Error ? error : new Error(String(error));
  console.error(`[smoke] unexpected failure: ${err.message}`);
  process.exit(1);
});
