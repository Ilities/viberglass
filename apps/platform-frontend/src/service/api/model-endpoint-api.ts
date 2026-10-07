import { API_BASE_URL } from '@/lib'
import type { ApiResponse, ModelEndpoint, ModelEndpointInput, ModelEndpointView } from '@viberglass/types'
import { apiFetch } from './client'

async function send(path: string, method: string, input?: ModelEndpointInput): Promise<Response> {
  const response = await apiFetch(`${API_BASE_URL}/api/model-endpoints${path}`, {
    method,
    ...(input ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) } : {}),
  })
  if (!response.ok) {
    const body = await response.json()
    throw new Error(
      body.details?.map((detail: { message: string }) => detail.message).join('; ') ||
        body.error ||
        'Endpoint request failed'
    )
  }
  return response
}

async function request<T>(path = '', method = 'GET', input?: ModelEndpointInput): Promise<T> {
  const body: ApiResponse<T> = await (await send(path, method, input)).json()
  return body.data
}

export const listModelEndpoints = () => request<ModelEndpointView[]>()
export const saveModelEndpoint = (input: ModelEndpointInput, id?: string) =>
  request<ModelEndpoint>(id ? `/${id}` : '', id ? 'PUT' : 'POST', input)
export const checkModelEndpoint = (input: ModelEndpointInput) =>
  request<{ models: string[]; discoverySupported: boolean; detail?: string }>('/check', 'POST', input)
export const deleteModelEndpoint = async (id: string): Promise<void> => {
  await send(`/${id}`, 'DELETE')
}
