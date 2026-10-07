/** Clouds Viberglass can deploy open-weight models to. */
export type ModelHostKind = 'verda'

export const MODEL_HOST_KINDS: readonly ModelHostKind[] = ['verda']

export const MODEL_HOST_LABELS: Record<ModelHostKind, string> = { verda: 'Verda' }

export function isModelHostKind(value: unknown): value is ModelHostKind {
  return value === 'verda'
}

/**
 * A cloud account deployments are created in. The client secret and the key that
 * requests to its deployments carry are stored as platform-managed secrets.
 */
export interface ModelHostAccount {
  id: string
  name: string
  host: ModelHostKind
  clientId: string
  hasHuggingFaceToken: boolean
  createdAt: string
  updatedAt: string
}

export interface ModelHostAccountInput {
  name: string
  host: ModelHostKind
  clientId: string
  /** Required on create; left unset on update to keep the stored value. */
  clientSecret?: string
  /** The key requests to this account's deployments must carry. Required on create. */
  endpointKey?: string
  /** For gated models. An empty string removes the stored token. */
  huggingFaceToken?: string
}

/** A GPU size a cloud can run a deployment on. */
export interface ModelHostFlavour {
  /** The cloud's compute name. */
  id: string
  gpuCount: number
  gpu: string
  vramGb: number
  pricePerHour: number | null
  currency: string | null
  available: boolean
  /**
   * The vLLM Recipes hardware key of one such GPU, when recipes cover it. Recipes name
   * multi-GPU setups of some cards with a suffix, such as `rtx_pro_6000_2x`.
   */
  recipeHardware: string | null
}

/**
 * Who decides how many replicas run: the cloud, scaling to zero when idle (`scale-to-zero`),
 * one replica always on (`keep-warm`), or none at all (`stopped`).
 */
export type ModelDeploymentMode = 'scale-to-zero' | 'keep-warm' | 'stopped'

export function isModelDeploymentMode(value: unknown): value is ModelDeploymentMode {
  return value === 'scale-to-zero' || value === 'keep-warm' || value === 'stopped'
}

/** What the cloud reports. `unknown` when it couldn't be asked. */
export type ModelDeploymentState =
  | 'creating'
  | 'idle'
  | 'waking'
  | 'running'
  | 'stopped'
  | 'failed'
  | 'unknown'

export interface ModelDeploymentStatus {
  state: ModelDeploymentState
  /** The cloud's own words, when the state needs explaining. */
  detail?: string
}

export interface ModelDeploymentInput {
  name: string
  accountId: string
  /** Hugging Face model id; also the model name the endpoint serves. */
  model: string
  flavour: { id: string; gpuCount: number }
  /** Arguments after `vllm serve <model>`. */
  servingArgs: string[]
}

export interface ModelDeployment {
  id: string
  name: string
  accountId: string
  host: ModelHostKind
  model: string
  flavour: { id: string; gpuCount: number }
  servingArgs: string[]
  mode: ModelDeploymentMode
  endpointId: string
  createdAt: string
  updatedAt: string
}

export interface ModelDeploymentView extends ModelDeployment {
  status: ModelDeploymentStatus
  /** Price per hour of one replica, when the cloud publishes it. */
  pricePerHour: number | null
  currency: string | null
  runners: string[]
}

/** A model vLLM Recipes covers. */
export interface ModelRecipeSummary {
  model: string
  title: string
  provider: string
}

export interface ModelRecipe extends ModelRecipeSummary {
  description: string
  /** Hardware keys the recipe lists, such as `h100`. */
  hardware: string[]
  /** Smallest GPU memory the default variant needs, when stated. */
  minVramGb: number | null
}

/** Serving arguments a recipe recommends for one model on one kind of hardware. */
export interface ModelRecipeCommand {
  model: string
  hardware: string
  servingArgs: string[]
  gpuCount: number
}

/** A deployment request served from a container the cloud runs. */
export interface ModelHostDeploymentSpec {
  name: string
  model: string
  flavour: { id: string; gpuCount: number }
  servingArgs: string[]
  mode: ModelDeploymentMode
}

/** Account credentials a host adapter receives, already resolved. */
export interface ModelHostCredentials {
  clientId: string
  clientSecret: string
  huggingFaceToken?: string
}

/**
 * A cloud that runs model deployments. It scales them itself; Viberglass only
 * creates, reads, switches mode and deletes.
 */
export interface ModelHost {
  readonly kind: ModelHostKind
  readonly label: string
  listFlavours(account: ModelHostCredentials): Promise<ModelHostFlavour[]>
  /** Returns the cloud's id for the deployment and its OpenAI-compatible base URL. */
  create(
    account: ModelHostCredentials,
    spec: ModelHostDeploymentSpec,
  ): Promise<{ externalId: string; baseUrl: string }>
  getStatus(account: ModelHostCredentials, externalId: string): Promise<ModelDeploymentStatus>
  setMode(account: ModelHostCredentials, externalId: string, mode: ModelDeploymentMode): Promise<void>
  delete(account: ModelHostCredentials, externalId: string): Promise<void>
}
