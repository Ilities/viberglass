import type { Clanker, ProjectReadinessCheck } from "@viberglass/types";

function isUsable(runner: Clanker): boolean {
  return runner.status === "active" && Boolean(runner.deploymentStrategyId);
}

/**
 * Whether an agent has a model key. Any runner counts, started or not (FR8:
 * a stopped runner with a key needs starting, not another key), but only
 * keys whose secret still exists.
 */
export function agentCredentialsCheck(runners: Clanker[], existingSecretIds: Set<string>): ProjectReadinessCheck {
  if (runners.some((runner) => runner.secretIds.some((id) => existingSecretIds.has(id)))) {
    return {
      key: "agentCredentials",
      label: "Model key",
      state: "ready",
      summary: "An agent has a model key.",
    };
  }
  return {
    key: "agentCredentials",
    label: "Model key",
    state: "missing",
    code: "configure_agent_credentials",
    summary: "Connect an AI model key so agents can work.",
    remediationUrl: "/setup",
  };
}

/** Whether an agent is running, and if not, what's wrong with the one that isn't. */
export function agentRunnerCheck(runners: Clanker[]): ProjectReadinessCheck {
  const usable = runners.filter(isUsable);
  if (usable.length > 0) {
    return {
      key: "agentRunner",
      label: "Agent",
      state: "ready",
      summary: `${usable.length} agent${usable.length === 1 ? " is" : "s are"} ready.`,
    };
  }
  if (runners.length === 0) {
    return {
      key: "agentRunner",
      label: "Agent",
      state: "missing",
      code: "start_agent_runner",
      summary: "Set up an agent to run tasks.",
      remediationUrl: "/setup",
    };
  }

  // Prefer setup's default agent, then whichever is closest to working.
  const rank = (runner: Clanker) =>
    (runner.slug === "default-agent" ? 0 : 3) + (runner.status === "deploying" ? 0 : runner.status === "failed" ? 1 : 2);
  const runner = [...runners].sort((a, b) => rank(a) - rank(b))[0];
  const remediationUrl = `/clankers/${runner.slug}`;
  if (runner.status === "deploying") {
    return {
      key: "agentRunner",
      label: "Agent",
      state: "unavailable",
      code: "start_agent_runner",
      summary: `${runner.name} is starting.`,
      remediationUrl,
    };
  }
  if (runner.status === "failed") {
    return {
      key: "agentRunner",
      label: "Agent",
      state: "unavailable",
      code: "start_agent_runner",
      summary: `${runner.name} failed to start${runner.statusMessage ? `: ${runner.statusMessage}` : "."}`,
      remediationUrl,
    };
  }
  return {
    key: "agentRunner",
    label: "Agent",
    state: "unavailable",
    code: "start_agent_runner",
    summary: `${runner.name} isn't started. Start it to run tasks.`,
    remediationUrl,
  };
}
