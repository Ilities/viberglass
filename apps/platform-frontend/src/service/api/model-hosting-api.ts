import { API_BASE_URL } from '@/lib'
import type {
  ApiResponse,
  ModelDeployment,
  ModelDeploymentInput,
  ModelDeploymentMode,
  ModelDeploymentView,
  ModelHostAccount,
  ModelHostAccountInput,
  ModelHostFlavour,
  ModelRecipe,
  ModelRecipeCommand,
  ModelRecipeSummary,
} from '@viberglass/types'
import { apiFetch } from './client'

async function send(path: string, method: string, input?: unknown): Promise<Response> {
  const response = await apiFetch(`${API_BASE_URL}/api${path}`, {
    method,
    ...(input ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) } : {}),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(
      body.details?.map((detail: { message: string }) => detail.message).join('; ') ||
        body.error ||
        body.message ||
        'Request failed'
    )
  }
  return response
}

async function request<T>(path: string, method = 'GET', input?: unknown): Promise<T> {
  const body: ApiResponse<T> = await (await send(path, method, input)).json()
  return body.data
}

async function act(path: string, method: string, input?: unknown): Promise<void> {
  await send(path, method, input)
}

export const listModelHostAccounts = () => request<ModelHostAccount[]>('/model-host-accounts')
export const saveModelHostAccount = (input: ModelHostAccountInput, id?: string) =>
  request<ModelHostAccount>(id ? `/model-host-accounts/${id}` : '/model-host-accounts', id ? 'PUT' : 'POST', input)
export const deleteModelHostAccount = (id: string) => act(`/model-host-accounts/${id}`, 'DELETE')
export const listModelHostFlavours = (accountId: string) =>
  request<ModelHostFlavour[]>(`/model-host-accounts/${accountId}/flavours`)

export const listModelDeployments = () => request<ModelDeploymentView[]>('/model-deployments')
export const createModelDeployment = (input: ModelDeploymentInput) =>
  request<ModelDeployment>('/model-deployments', 'POST', input)
export const setModelDeploymentMode = (id: string, mode: ModelDeploymentMode) =>
  act(`/model-deployments/${id}/mode`, 'POST', { mode })
export const deleteModelDeployment = (id: string) => act(`/model-deployments/${id}`, 'DELETE')

export const listModelRecipes = () => request<ModelRecipeSummary[]>('/model-deployments/recipes')
export const getModelRecipe = (model: string) => request<ModelRecipe>(`/model-deployments/recipes/${model}`)
/** Gigabytes of weight files on Hugging Face; null when it can't be told. */
export const getModelWeightsGb = (model: string) =>
  request<{ weightsGb: number | null }>(`/model-deployments/model-size/${model}`).then((size) => size.weightsGb)

export const getModelRecipeCommand = (model: string, hardware: string) =>
  request<ModelRecipeCommand>(`/model-deployments/recipes/${model}/hardware/${encodeURIComponent(hardware)}`)
