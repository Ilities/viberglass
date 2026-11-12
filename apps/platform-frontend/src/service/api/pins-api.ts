import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'
import { toErrorFromResponse } from '@/service/api/user-api'
import type { ApiResponse, Pin, PinTarget } from '@viberglass/types'

const PINS_URL = `${API_BASE_URL}/api/pins`

async function read<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) throw toErrorFromResponse(await response.json().catch(() => ({})), fallback)
  const data: ApiResponse<T> = await response.json()
  return data.data
}

const json = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export async function getPins(): Promise<Pin[]> {
  return read(await apiFetch(PINS_URL), "Couldn't load your pins")
}

export async function addPin(target: PinTarget): Promise<Pin[]> {
  return read(await apiFetch(PINS_URL, json('POST', { target })), "Couldn't pin it")
}

export async function removePin(pinId: string): Promise<Pin[]> {
  return read(await apiFetch(`${PINS_URL}/${pinId}`, { method: 'DELETE' }), "Couldn't unpin it")
}

export async function reorderPins(pinIds: string[]): Promise<Pin[]> {
  return read(await apiFetch(`${PINS_URL}/order`, json('PUT', { pinIds })), "Couldn't save the order")
}

/** Clears a pin's "new version" mark; nothing happens when it isn't pinned. */
export async function markPinOpened(target: PinTarget): Promise<void> {
  const response = await apiFetch(`${PINS_URL}/opened`, json('POST', { target }))
  if (!response.ok) throw toErrorFromResponse(await response.json().catch(() => ({})), "Couldn't update the pin")
}
