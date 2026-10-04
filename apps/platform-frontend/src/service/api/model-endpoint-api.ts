import { API_BASE_URL } from '@/lib'
import type { ApiResponse, ModelEndpoint, ModelEndpointInput } from '@viberglass/types'
import { apiFetch } from './client'

async function request<T>(path = '', method = 'GET', input?: ModelEndpointInput): Promise<T> {
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
  const body: ApiResponse<T> = await response.json()
  return body.data
}

export const listModelEndpoints = () => request<ModelEndpoint[]>()
export const saveModelEndpoint = (input: ModelEndpointInput, id?: string) =>
  request<ModelEndpoint>(id ? `/${id}` : '', id ? 'PUT' : 'POST', input)
export const checkModelEndpoint = (input: ModelEndpointInput) =>
  request<{ models: string[]; discoverySupported: boolean }>('/check', 'POST', input)
