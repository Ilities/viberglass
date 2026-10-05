import { Select as RadixSelect } from '@radix-ui/themes'
import { EndpointModelField } from './EndpointModelField'
import { ModelEndpointDialog } from './ModelEndpointDialog'
import { getAgentModelApiFormats, type ModelEndpoint, type ModelEndpointSelection } from '@viberglass/types'
import { Button } from '@/components/button'
import { Description, Field, FieldGroup, Label } from '@/components/fieldset'
import { Select } from '@/components/select'
import type { Secret } from '@/service/api/secret-api'
import { AGENT_LABELS, type AgentType, type ModelProviderId } from '@viberglass/types'
import { useState } from 'react'
import { AgentSpecificFields, type AgentSettings } from '../config/agents'
import { keysForProvider, providerOptionsForAgent } from '../config/modelKey'
import { AddModelKeyDialog } from './AddModelKeyDialog'

// The select can't hold an empty value, so "nothing chosen" needs a value of its own.
const NONE = 'none'

interface ModelSectionProps {
  endpoints: ModelEndpoint[]
  endpointSelection: ModelEndpointSelection | null
  onEndpointChange: (id: string) => void
  onEndpointModelChange: (selection: ModelEndpointSelection) => void
  onEndpointSaved: (endpoint: ModelEndpoint) => void
  agent: AgentType | ''
  provider: ModelProviderId | ''
  modelKeyId: string
  secrets: Secret[]
  settings: AgentSettings
  onProviderChange: (provider: ModelProviderId | '') => void
  onModelKeyChange: (secretId: string) => void
  onSettingsChange: (changes: Partial<AgentSettings>) => void
  onKeyAdded: (secret: Secret) => void
}

/** Which provider the agent talks to, with which of that provider's keys, and its model settings. */
export function ModelSection({
  endpoints, endpointSelection, onEndpointChange, onEndpointModelChange, onEndpointSaved,
  agent,
  provider,
  modelKeyId,
  secrets,
  settings,
  onProviderChange,
  onModelKeyChange,
  onSettingsChange,
  onKeyAdded,
}: ModelSectionProps) {
  const [addingKey, setAddingKey] = useState(false)
  const [addingEndpoint, setAddingEndpoint] = useState(false)
  const endpoint = endpoints.find((item) => item.id === endpointSelection?.endpointId)
  const formats = getAgentModelApiFormats(agent)
  // Only endpoints that speak an API this agent understands; the rest would fail at the first run.
  const usableEndpoints = endpoints.filter((item) => formats.includes(item.apiFormat))
  const options = providerOptionsForAgent(agent)
  const usesChatGptLogin = agent === 'codex' && settings.codexAuthMode !== 'api_key'
  const keys = keysForProvider(secrets, provider, modelKeyId)
  const envVar = options.find((option) => option.provider === provider)?.envVar

  if (!agent) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Pick an agent first.</p>
  }

  return (
    <FieldGroup>
      {agent === 'codex' && (
        <AgentSpecificFields selectedAgent={agent} settings={settings} onChange={onSettingsChange} />
      )}

      {!usesChatGptLogin && (
        <>
          <Field>
            <Label>Provider</Label>
            <Description>Choose a provider or a compatible endpoint for {AGENT_LABELS[agent]}.</Description>
            <Select
              value={endpointSelection ? `endpoint:${endpointSelection.endpointId}` : provider || NONE}
              onChange={(value) => {
                if (value.startsWith('endpoint:')) onEndpointChange(value.slice(9))
                else onProviderChange(options.find((option) => option.provider === value)?.provider ?? '')
              }}
            >
              <option value={NONE}>Choose a provider or endpoint</option>
              <RadixSelect.Group><RadixSelect.Label>Providers</RadixSelect.Label>
              {options.map((option) => (
                <RadixSelect.Item key={option.provider} value={option.provider}>
                  {option.label}
                </RadixSelect.Item>
              ))}</RadixSelect.Group>
              {usableEndpoints.length > 0 && <RadixSelect.Group><RadixSelect.Label>Custom endpoints</RadixSelect.Label>
                {usableEndpoints.map((item) => <RadixSelect.Item key={item.id} value={`endpoint:${item.id}`}>{item.name}</RadixSelect.Item>)}
              </RadixSelect.Group>}
            </Select>
            {formats.length > 0 ? (
              <Button type="button" plain onClick={() => setAddingEndpoint(true)}>Add endpoint</Button>
            ) : (
              <Description>
                {AGENT_LABELS[agent]} uses only its own providers here; it can&apos;t run on a custom endpoint yet. OpenCode and Pi can.
              </Description>
            )}
            {addingEndpoint && <ModelEndpointDialog open onClose={() => setAddingEndpoint(false)} onSaved={(value) => { onEndpointSaved(value); setAddingEndpoint(false) }} secrets={secrets} formats={formats} />}
            {endpoint && endpointSelection && <EndpointModelField endpoint={endpoint} selection={endpointSelection} onChange={onEndpointModelChange} onSaved={onEndpointSaved} secrets={secrets} formats={formats} />}
          </Field>

          {provider && !endpointSelection && (
            <Field>
              <div className="flex items-center justify-between">
                <Label>API key</Label>
                <Button type="button" plain onClick={() => setAddingKey(true)}>
                  Add a key
                </Button>
              </div>
              <Description>
                {keys.length === 0
                  ? 'No key from this provider yet. Add one to continue.'
                  : envVar
                    ? `Given to the agent as ${envVar}.`
                    : 'The key the agent uses.'}
              </Description>
              {keys.length > 0 && (
                <Select value={modelKeyId || NONE} onChange={(value) => onModelKeyChange(value === NONE ? '' : value)}>
                  <option value={NONE}>Choose a key</option>
                  {keys.map((secret) => (
                    <option key={secret.id} value={secret.id}>
                      {secret.name}
                    </option>
                  ))}
                </Select>
              )}
              <AddModelKeyDialog
                key={provider}
                provider={provider}
                open={addingKey}
                onClose={() => setAddingKey(false)}
                onAdded={(secret) => {
                  setAddingKey(false)
                  onKeyAdded(secret)
                }}
              />
            </Field>
          )}
        </>
      )}

      {agent !== 'codex' && !endpointSelection && (
        <AgentSpecificFields selectedAgent={agent} settings={settings} onChange={onSettingsChange} />
      )}
    </FieldGroup>
  )
}
