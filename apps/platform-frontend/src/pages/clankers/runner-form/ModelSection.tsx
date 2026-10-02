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
            <Description>Who issued the key. {AGENT_LABELS[agent]} can run keys from these providers.</Description>
            <Select
              value={provider || NONE}
              onChange={(value) => onProviderChange(options.find((option) => option.provider === value)?.provider ?? '')}
            >
              <option value={NONE}>Choose a provider</option>
              {options.map((option) => (
                <option key={option.provider} value={option.provider}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          {provider && (
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

      {agent !== 'codex' && (
        <AgentSpecificFields selectedAgent={agent} settings={settings} onChange={onSettingsChange} />
      )}
    </FieldGroup>
  )
}
