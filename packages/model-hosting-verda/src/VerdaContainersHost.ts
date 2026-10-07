import { randomBytes } from 'crypto'
import type {
  ModelDeploymentMode,
  ModelDeploymentStatus,
  ModelHost,
  ModelHostCredentials,
  ModelHostDeploymentSpec,
  ModelHostFlavour,
} from '@viberglass/types'
import { VerdaApiClient, VerdaApiError } from './VerdaApiClient'
import { verdaDeploymentBody, verdaScaling } from './verdaDeploymentBody'
import { readComputeResources, readContainerTypes, verdaFlavours } from './verdaFlavours'
import { verdaStatus } from './verdaStatus'

/** Verda deployment names are DNS labels: lowercase, digits and hyphens, at most 63 characters. */
export function verdaDeploymentName(name: string, suffix = randomBytes(3).toString('hex')): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '')
  return `${slug || 'model'}-${suffix}`
}

function huggingFaceSecretName(deploymentName: string): string {
  return `${deploymentName}-hf-token`
}

function readString(value: unknown, key: string): string | undefined {
  if (typeof value !== 'object' || value === null || !(key in value)) return undefined
  const field: unknown = Reflect.get(value, key)
  return typeof field === 'string' ? field : undefined
}

function readReplicaStatuses(value: unknown): string[] {
  if (typeof value !== 'object' || value === null || !('list' in value) || !Array.isArray(value.list)) return []
  return value.list.flatMap((replica: unknown) => {
    const status = readString(replica, 'status')
    return status ? [status] : []
  })
}

async function ignoreStatuses(request: Promise<unknown>, statuses: number[]): Promise<void> {
  try {
    await request
  } catch (error) {
    if (!(error instanceof VerdaApiError && statuses.includes(error.status))) throw error
  }
}

export class VerdaContainersHost implements ModelHost {
  readonly kind = 'verda' as const
  readonly label = 'Verda'

  constructor(private readonly api = new VerdaApiClient()) {}

  async listFlavours(account: ModelHostCredentials): Promise<ModelHostFlavour[]> {
    const [resources, types] = await Promise.all([
      this.api.request(account, 'GET', '/serverless-compute-resources'),
      this.api.request(account, 'GET', '/container-types?currency=eur'),
    ])
    return verdaFlavours(readComputeResources(resources), readContainerTypes(types))
  }

  async create(
    account: ModelHostCredentials,
    spec: ModelHostDeploymentSpec,
  ): Promise<{ externalId: string; baseUrl: string }> {
    const name = verdaDeploymentName(spec.name)
    const secretName = account.huggingFaceToken ? huggingFaceSecretName(name) : null
    if (secretName)
      await this.api.request(account, 'POST', '/secrets', { name: secretName, value: account.huggingFaceToken })
    try {
      const created = await this.api.request(
        account,
        'POST',
        '/container-deployments',
        verdaDeploymentBody(name, spec, secretName),
      )
      const baseUrl = readString(created, 'endpoint_base_url')
      if (!baseUrl) throw new Error('Verda returned no endpoint URL for the deployment.')
      return { externalId: name, baseUrl: `${baseUrl.replace(/\/+$/, '')}/v1` }
    } catch (error) {
      await this.delete(account, name).catch(() => undefined)
      throw error
    }
  }

  async getStatus(account: ModelHostCredentials, externalId: string): Promise<ModelDeploymentStatus> {
    const path = `/container-deployments/${encodeURIComponent(externalId)}`
    try {
      const [status, replicas] = await Promise.all([
        this.api.request(account, 'GET', `${path}/status`),
        this.api.request(account, 'GET', `${path}/replicas`),
      ])
      return verdaStatus(readString(status, 'status') ?? '', readReplicaStatuses(replicas))
    } catch (error) {
      if (error instanceof VerdaApiError && error.status === 404)
        return { state: 'failed', detail: 'The deployment no longer exists on Verda.' }
      throw error
    }
  }

  async setMode(account: ModelHostCredentials, externalId: string, mode: ModelDeploymentMode): Promise<void> {
    const path = `/container-deployments/${encodeURIComponent(externalId)}`
    if (mode === 'stopped') {
      await this.api.request(account, 'POST', `${path}/pause`)
      return
    }
    const current = await this.api.request(account, 'GET', `${path}/status`)
    if (readString(current, 'status') === 'paused') await this.api.request(account, 'POST', `${path}/resume`)
    await this.api.request(account, 'PATCH', `${path}/scaling`, verdaScaling(mode))
  }

  async delete(account: ModelHostCredentials, externalId: string): Promise<void> {
    // Verda ignores timeout=0 and answers 408 after a minute, but the deletion carries on regardless.
    await ignoreStatuses(
      this.api.request(account, 'DELETE', `/container-deployments/${encodeURIComponent(externalId)}?timeout=0`),
      [404, 408],
    )
    // The account's token may have been removed since, so look for the secret regardless.
    await ignoreStatuses(
      this.api.request(account, 'DELETE', `/secrets/${encodeURIComponent(huggingFaceSecretName(externalId))}`),
      [404],
    )
  }
}
