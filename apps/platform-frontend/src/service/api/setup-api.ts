import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'
import type {
  ApiResponse,
  CreatedSpace,
  DefaultAgent,
  DemoWorkspace,
  ModelProviderId,
  SavedModelKey,
  SavedRepository,
  SetupProvider,
  SetupStatus,
} from '@viberglass/types'

/** The server's plain-language reason; setup shows it to the person as is. */
async function readData<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || error.message || fallback)
  }
  const body: ApiResponse<T> = await response.json()
  return body.data
}

function post(path: string, body: unknown): Promise<Response> {
  return apiFetch(`${API_BASE_URL}/api/setup/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function getSetupStatus(): Promise<SetupStatus> {
  return readData(await apiFetch(`${API_BASE_URL}/api/setup/status`), "Couldn't load the setup status")
}

export async function getSetupProviders(): Promise<SetupProvider[]> {
  return readData(await apiFetch(`${API_BASE_URL}/api/setup/providers`), "Couldn't load the AI providers")
}

export async function saveModelKey(provider: ModelProviderId, key: string): Promise<SavedModelKey> {
  return readData(await post('model-key', { provider, key }), "Couldn't check the key")
}

export async function saveRepository(repository: string, token: string): Promise<SavedRepository> {
  return readData(await post('repository', { repository, token }), "Couldn't check the repository")
}

export async function createSpace(name: string, repository: string, baseBranch: string): Promise<CreatedSpace> {
  return readData(await post('space', { name, repository, baseBranch }), "Couldn't create the space")
}

export async function prepareDefaultAgent(provider: ModelProviderId): Promise<DefaultAgent> {
  return readData(await post('agent', { provider }), "Couldn't prepare the agent")
}

export async function loadDemoWorkspace(): Promise<DemoWorkspace> {
  return readData(await post('demo', {}), "Couldn't load the demo workspace")
}

export async function removeDemoWorkspace(): Promise<void> {
  const response = await apiFetch(`${API_BASE_URL}/api/setup/demo`, { method: 'DELETE' })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || error.message || "Couldn't remove the demo workspace")
  }
}
