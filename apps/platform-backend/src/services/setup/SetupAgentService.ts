import {
  AGENT_LABELS,
  agentForModelApiFormat,
  getDefaultAgentBindingForProvider,
  getModelProvider,
  type AgentProviderBinding,
  type Clanker,
  type ClankerStrategyConfig,
  type CreateClankerRequest,
  type DefaultAgent,
  type DeploymentStrategy,
  type AgentType,
  type ModelEndpoint,
  type ModelProviderId,
  type SetupModelChoice,
  type UpdateClankerRequest,
} from "@viberglass/types";
import { ModelEndpointDAO } from "../../persistence/modelEndpoint/ModelEndpointDAO";
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
  getLatestSecretForProvider(provider: ModelProviderId): Promise<{ id: string } | null>;
}

interface Endpoints {
  get(id: string): Promise<ModelEndpoint | null>;
}

/** What the default agent runs, before choosing where it runs. */
type AgentPlan = Pick<CreateClankerRequest, "description" | "secretBindings" | "modelEndpoint"> & {
  agent: AgentType;
  agentConfig: Record<string, unknown>;
};

interface Starter {
  start(clanker: Clanker): Promise<{ clanker: Clanker }>;
}

function bindingConfig(binding: AgentProviderBinding): Record<string, unknown> {
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
    JSON.stringify(existing.secretBindings) === JSON.stringify(update.secretBindings) &&
    JSON.stringify(existing.deploymentConfig?.agent) === JSON.stringify(update.deploymentConfig?.agent) &&
    JSON.stringify(existing.modelEndpoint ?? null) === JSON.stringify(update.modelEndpoint ?? null)
  );
}

/**
 * Setup's "Getting ready…": one runner, "Default agent", running the key's
 * provider on its default harness, or a workspace model endpoint on a harness
 * that speaks its API format. It runs where the instance can run agents
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
    private readonly endpoints: Endpoints = new ModelEndpointDAO(),
  ) {}

  async prepareDefaultAgent(choice: SetupModelChoice): Promise<DefaultAgent> {
    const plan = "provider" in choice ? await this.forProvider(choice.provider) : await this.forEndpoint(choice);
    const { strategy, config, compute } = await this.chooseCompute(plan);
    const request: CreateClankerRequest = {
      name: DEFAULT_AGENT_NAME,
      description: plan.description,
      deploymentStrategyId: strategy.id,
      deploymentConfig: { version: 1, strategy: config, agent: plan.agentConfig },
      agent: plan.agent,
      secretBindings: plan.secretBindings,
      modelEndpoint: plan.modelEndpoint ?? null,
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

  private async forProvider(providerId: ModelProviderId): Promise<AgentPlan> {
    const provider = getModelProvider(providerId);
    const binding = getDefaultAgentBindingForProvider(providerId);
    const secret = binding ? await this.secrets.getLatestSecretForProvider(providerId) : null;
    if (!binding || !secret) {
      throw new SetupServiceError(
        SETUP_SERVICE_ERROR_CODE.MODEL_KEY_MISSING,
        `Connect your ${provider.displayName} key first, so the agent has something to run with.`,
      );
    }
    return {
      agent: binding.agent,
      agentConfig: bindingConfig(binding),
      description: `Runs ${AGENT_LABELS[binding.agent]} with your ${provider.displayName} key. Created by setup.`,
      secretBindings: [{ envVar: binding.envVar, secretId: secret.id }],
    };
  }

  /** The endpoint's own key reaches the agent through the endpoint, so the runner binds none. */
  private async forEndpoint(choice: { endpointId: string; model: string }): Promise<AgentPlan> {
    const endpoint = await this.endpoints.get(choice.endpointId);
    if (!endpoint) {
      throw new SetupServiceError(SETUP_SERVICE_ERROR_CODE.MODEL_KEY_MISSING, "That model endpoint no longer exists. Add it again.");
    }
    const agent = agentForModelApiFormat(endpoint.apiFormat);
    if (!agent) {
      throw new SetupServiceError(
        SETUP_SERVICE_ERROR_CODE.NO_HARNESS_FOR_PROVIDER,
        `No agent here speaks ${endpoint.apiFormat} yet. Use an endpoint with a Chat Completions, Responses or Anthropic Messages API.`,
      );
    }
    return {
      agent,
      agentConfig: { type: agent },
      description: `Runs ${AGENT_LABELS[agent]} on ${endpoint.name} (${choice.model}). Created by setup.`,
      secretBindings: [],
      modelEndpoint: { endpointId: endpoint.id, model: choice.model },
    };
  }

  private async chooseCompute(plan: AgentPlan): Promise<{
    strategy: DeploymentStrategy;
    config: ClankerStrategyConfig;
    compute: "ecs" | "docker";
  }> {
    const ecs = await this.strategies.getDeploymentStrategyByName("ecs");
    if (ecs) {
      const config: ClankerStrategyConfig = { type: "ecs", provisioningMode: "managed" };
      const candidate = this.candidate(plan, ecs, config);
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

  private candidate(plan: AgentPlan, strategy: DeploymentStrategy, config: ClankerStrategyConfig): Clanker {
    return {
      id: "",
      name: DEFAULT_AGENT_NAME,
      slug: DEFAULT_AGENT_SLUG,
      description: null,
      deploymentStrategyId: strategy.id,
      deploymentStrategy: strategy,
      deploymentConfig: { version: 1, strategy: config, agent: plan.agentConfig },
      configFiles: [],
      agent: plan.agent,
      secretBindings: [],
      mcpServerIds: [],
      skillIds: [],
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
