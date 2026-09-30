import { findOpenCodeSessionId, parseOpenCodeSessionExport } from "@viberglass/agent-core";
import type { AgentUsageReport } from "@viberglass/agent-core";

export type OpenCodeCommand = (args: string[]) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

type SessionDetails = Pick<AgentUsageReport, "model" | "harnessVersion">;

/**
 * The model and OpenCode version a run used, from `opencode export` of its
 * session. Best effort: a run whose session cannot be exported keeps its
 * usage and records no model; `onFailure` says why.
 */
export async function readOpenCodeSessionDetails(
  runStdout: string,
  opencode: OpenCodeCommand,
  onFailure: (reason: string) => void = () => {},
): Promise<SessionDetails> {
  const sessionId = findOpenCodeSessionId(runStdout);
  if (!sessionId) {
    onFailure("the run output named no session");
    return {};
  }

  try {
    const result = await opencode(["export", sessionId]);
    if (result.exitCode !== 0) {
      onFailure(`opencode export exited ${result.exitCode}: ${result.stderr.trim().slice(0, 300)}`);
      return {};
    }
    const details = parseOpenCodeSessionExport(result.stdout);
    if (!details.model && !details.harnessVersion) {
      onFailure(`opencode export output had no model or version: ${result.stdout.trim().slice(0, 200)}`);
    }
    return details;
  } catch (error) {
    onFailure(`opencode export failed: ${error instanceof Error ? error.message : String(error)}`);
    return {};
  }
}
