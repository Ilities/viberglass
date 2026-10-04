import { listModelEndpoints } from '@/service/api/model-endpoint-api'
import {
  getAgentModelApiFormats,
  type AgentType,
  type ModelEndpoint,
  type ModelEndpointSelection,
} from '@viberglass/types'
import { useEffect, useState } from 'react'

export function useModelEndpoints(initial?: ModelEndpointSelection | null) {
  const [endpoints, setEndpoints] = useState<ModelEndpoint[]>([])
  const [selection, setSelection] = useState<ModelEndpointSelection | null>(initial ?? null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    listModelEndpoints()
      .then(setEndpoints)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load endpoints'))
  }, [])
  function choose(id: string) {
    const endpoint = endpoints.find((item) => item.id === id)
    setSelection(endpoint ? { endpointId: id, model: endpoint.models[0] ?? '' } : null)
  }
  function added(endpoint: ModelEndpoint) {
    setEndpoints((previous) => [...previous.filter((item) => item.id !== endpoint.id), endpoint])
    setSelection({ endpointId: endpoint.id, model: endpoint.models[0] ?? '' })
  }
  function forAgent(agent: AgentType | '') {
    return endpoints.filter((endpoint) => getAgentModelApiFormats(agent).includes(endpoint.apiFormat))
  }
  return { endpoints, selection, setSelection, choose, added, forAgent, error }
}
