import { isObjectRecord, readAgentSignIn, type AgentSignInMethod } from "@viberglass/types";

/** Signing Codex in with a ChatGPT account, by a device code; the login is Codex's auth.json. */
export const CHATGPT_SIGN_IN: AgentSignInMethod = {
  id: "chatgpt",
  label: "ChatGPT account",
  kind: "device_code",
  credentialEnvVar: "CODEX_AUTH_JSON",
};

export interface CodexAuthSettings {
  /** Signs in with a ChatGPT account rather than an API key. */
  usesChatGpt: boolean;
  /** Where the worker puts the runner's stored login. */
  credentialEnvVar: string;
}

function resolveDeploymentConfig(
  clankerConfig?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!clankerConfig) {
    return undefined;
  }

  if (isObjectRecord(clankerConfig.deploymentConfig)) {
    return clankerConfig.deploymentConfig;
  }

  return clankerConfig;
}

export function resolveCodexAuthSettings(clankerConfig?: Record<string, unknown>): CodexAuthSettings {
  const deploymentConfig = resolveDeploymentConfig(clankerConfig);
  const agent = deploymentConfig?.version === 1 && isObjectRecord(deploymentConfig.agent) ? deploymentConfig.agent : undefined;
  const signIn = agent?.type === "codex" ? readAgentSignIn(agent.signIn) : undefined;
  return {
    usesChatGpt: signIn?.method === CHATGPT_SIGN_IN.id,
    credentialEnvVar: CHATGPT_SIGN_IN.credentialEnvVar,
  };
}
