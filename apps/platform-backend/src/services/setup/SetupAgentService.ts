import {
  AGENT_LABELS,
  getDefaultAgentBindingForProvider,
  getModelProvider,
  type AgentProviderBinding,
  type Clanker,
  type ClankerStrategyConfig,
  type CreateClankerRequest,
  type DefaultAgent,
  type DeploymentStrategy,
  type ModelProviderId,
  type UpdateClankerRequest,
} from "@viberglass/types";
import { ClankerDAO } from "../../persistence/clanker/ClankerDAO";
import { DeploymentStrategyDAO } from "../../persistence/clanker/DeploymentStrategyDAO";
import { SecretDAO } from "../../persistence/secret/SecretDAO";
import type { ClankerProvisioner } from "../../provisioning/ClankerProvisioner";
import { getClankerProvisioner } from "../../provisioning/provisioningFactory";
import { ClankerStartService } from "../ClankerStartService";
import {
  SETUP_SERVICE_ERROR_CODE,
  SetupServiceError,
} from "../errors/SetupServiceError";

export const DEFAULT_AGENT_SLUG = "default-agent";
const DEFAULT_AGENT_NAME = "Default agent";

interface Clankers {
  getClankerBySlug(slug: string): Promise<Clanker | null>;
  createClanker(request: CreateClankerRequest): Promise<Clanker>;
  updateClanker(id: string, request: UpdateClankerRequest): Promise<Clanker>;
}

interface Strategies {
  getDeploymentStrategyByName(name: string): Promise<DeploymentStrategy | null>;
}

interface Secrets {
  getSecretByName(name: string): Promise<{ id: string } | null>;
}

interface Starter {
  start(clanker: Clanker): Promise<{ clanker: Clanker }>;
}

function agentConfig(binding: AgentProviderBinding): Record<string, unknown> {
  return {
    type: binding.agent,
    ...(binding.model ? { model: binding.model } : {}),
    ...(binding.endpoint ? { endpoint: binding.endpoint } : {}),
  };
}

/** Same agent, key and settings: nothing to redo. */
function isUnchanged(existing: Clanker, update: CreateClankerRequest): boolean {
  return (
    existing.agent === update.agent &&
    existing.deploymentStrategyId === update.deploymentStrategyId &&
    JSON.stringify(existing.secretIds) === JSON.stringify(update.secretIds) &&
    JSON.stringify(existing.deploymentConfig?.agent) === JSON.stringify(update.deploymentConfig?.agent)
  );
}

/**
 * Setup's "Getting ready…": one runner, "Default agent", running the key's
 * provider on its default harness. It runs where the instance can run agents
 * — ECS on AWS (when the stack's ECS settings are present), otherwise a
 * pre-built image on the local Docker — and starts right away, with no
 * separate "Start". Running setup again reconfigures the same runner.
 */
export class SetupAgentService {
  constructor(
    private readonly clankers: Clankers = new ClankerDAO(),
    private readonly strategies: Strategies = new DeploymentStrategyDAO(),
    private readonly secrets: Secrets = new SecretDAO(),
    private readonly provisioner: Pick<ClankerProvisioner, "getProvisioningPreflightError"> = getClankerProvisioner(),
    private readonly starter: Starter = new ClankerStartService(),
  ) {}

  async prepareDefaultAgent(providerId: ModelProviderId): Promise<DefaultAgent> {
    const provider = getModelProvider(providerId);
    const binding = getDefaultAgentBindingForProvider(providerId);
    const secret = binding ? await this.secrets.getSecretByName(binding.envVar) : null;
    if (!binding || !secret) {
      throw new SetupServiceError(
        SETUP_SERVICE_ERROR_CODE.MODEL_KEY_MISSING,
        `Connect your ${provider.displayName} key first, so the agent has something to run with.`,
      );
    }

    const { strategy, config, compute } = await this.chooseCompute(binding);
    const request: CreateClankerRequest = {
      name: DEFAULT_AGENT_NAME,
      description: `Runs ${AGENT_LABELS[binding.agent]} with your ${provider.displayName} key. Created by setup.`,
      deploymentStrategyId: strategy.id,
      deploymentConfig: { version: 1, strategy: config, agent: agentConfig(binding) },
      agent: binding.agent,
      secretIds: [secret.id],
    };

    const existing = await this.clankers.getClankerBySlug(DEFAULT_AGENT_SLUG);
    if (existing && isUnchanged(existing, request) && (existing.status === "active" || existing.status === "deploying")) {
      return this.describe(existing, compute);
    }

    const clanker = existing
      ? await this.clankers.updateClanker(existing.id, { ...request, status: "inactive", statusMessage: null })
      : await this.clankers.createClanker(request);
    const { clanker: deploying } = await this.starter.start(clanker);
    return this.describe(deploying, compute);
  }

  private async chooseCompute(binding: AgentProviderBinding): Promise<{
    strategy: DeploymentStrategy;
    config: ClankerStrategyConfig;
    compute: "ecs" | "docker";
  }> {
    const ecs = await this.strategies.getDeploymentStrategyByName("ecs");
    if (ecs) {
      const config: ClankerStrategyConfig = { type: "ecs", provisioningMode: "managed" };
      const candidate = this.candidate(binding, ecs, config);
      if (this.provisioner.getProvisioningPreflightError(candidate) === null) {
        return { strategy: ecs, config, compute: "ecs" };
      }
    }

    const docker = await this.strategies.getDeploymentStrategyByName("docker");
    if (!docker) {
      throw new Error("The docker deployment strategy is missing; migrations seed it.");
    }
    // No image named: the handler uses the agent's catalog image and pulls it when missing.
    return { strategy: docker, config: { type: "docker", provisioningMode: "prebuilt" }, compute: "docker" };
  }

  private candidate(binding: AgentProviderBinding, strategy: DeploymentStrategy, config: ClankerStrategyConfig): Clanker {
    return {
      id: "",
      name: DEFAULT_AGENT_NAME,
      slug: DEFAULT_AGENT_SLUG,
      description: null,
      deploymentStrategyId: strategy.id,
      deploymentStrategy: strategy,
      deploymentConfig: { version: 1, strategy: config, agent: agentConfig(binding) },
      configFiles: [],
      agent: binding.agent,
      secretIds: [],
      status: "inactive",
      statusMessage: null,
      createdAt: "",
      updatedAt: "",
    };
  }

  private describe(clanker: Clanker, compute: "ecs" | "docker"): DefaultAgent {
    const agent = clanker.agent ?? "claude-code";
    return {
      clankerId: clanker.id,
      slug: clanker.slug,
      agent: clanker.agent,
      agentName: AGENT_LABELS[agent],
      compute,
      status: clanker.status,
      statusMessage: clanker.statusMessage ?? null,
    };
  }
}
