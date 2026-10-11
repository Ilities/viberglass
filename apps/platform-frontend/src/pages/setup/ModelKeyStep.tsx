import { Button } from '@/components/button'
import { Description, Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Listbox, ListboxLabel, ListboxOption } from '@/components/listbox'
import { Text } from '@/components/text'
import { saveModelKey } from '@/service/api/setup-api'
import {
  guessModelProviderFromKey,
  type ModelProviderId,
  type SetupModelChoice,
  type SetupProvider,
} from '@viberglass/types'
import { useState } from 'react'
import { CustomEndpointSetup } from './CustomEndpointSetup'
import { ExternalLink, SetupError, SetupFrame } from './SetupFrame'

/** The provider list's entry for a model API the workspace runs or rents itself. */
const CUSTOM = 'custom'

export function ModelKeyStep({
  providers,
  connectedProviders,
  initialProvider,
  onDone,
}: {
  providers: SetupProvider[]
  connectedProviders: ModelProviderId[]
  initialProvider: ModelProviderId | null
  onDone: (choice: SetupModelChoice) => void
}) {
  const [providerId, setProviderId] = useState<string>(initialProvider ?? '')
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isChecking, setIsChecking] = useState(false)

  const provider = providers.find((p) => p.id === providerId)
  const hasSavedKey = provider !== undefined && connectedProviders.includes(provider.id)

  function handleKeyChange(value: string) {
    setKey(value)
    // A distinctive prefix (sk-ant-, sk-or-, AIza…) picks the provider; generic sk- keys don't.
    const guessed = guessModelProviderFromKey(value)
    if (guessed && providers.some((p) => p.id === guessed.id)) setProviderId(guessed.id)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // The custom endpoint form checks and saves with its own button.
    if (providerId === CUSTOM) return
    if (!provider) {
      setError('Choose who issued the key.')
      return
    }
    if (!key.trim() && hasSavedKey) {
      onDone({ provider: provider.id })
      return
    }
    setError(null)
    setIsChecking(true)
    try {
      await saveModelKey(provider.id, key)
      onDone({ provider: provider.id })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't check the key.")
    } finally {
      setIsChecking(false)
    }
  }

  return (
    <SetupFrame
      step={1}
      title="Connect an AI model"
      intro="Paste an API key from your AI provider, or connect a compatible endpoint you run yourself. Agents use it to read your code and write their results."
    >
      <form onSubmit={handleSubmit} className="grid gap-6">
        {providerId !== CUSTOM && <SetupError message={error} />}
        <Field>
          <Label>Provider</Label>
          <Listbox value={providerId} onChange={setProviderId} placeholder="Who issued the key?" aria-label="Provider">
            {providers.map((p) => (
              <ListboxOption key={p.id} value={p.id}>
                <ListboxLabel>{p.displayName}</ListboxLabel>
              </ListboxOption>
            ))}
            <ListboxOption value={CUSTOM}>
              <ListboxLabel>Custom endpoint (z.ai, a self-hosted model, …)</ListboxLabel>
            </ListboxOption>
          </Listbox>
          {provider && (
            <Description>
              <ExternalLink href={provider.keyUrl}>Get a key from {provider.displayName}</ExternalLink>. It's stored
              encrypted, and agents run on {provider.agentName}.
            </Description>
          )}
        </Field>
        {providerId === CUSTOM ? (
          <CustomEndpointSetup onDone={(endpointId, model) => onDone({ endpointId, model })} />
        ) : (
          <>
            <Field>
              <Label>API key</Label>
              <Input
                type="password"
                name="key"
                autoComplete="off"
                spellCheck={false}
                value={key}
                onChange={(event) => handleKeyChange(event.target.value)}
                placeholder={hasSavedKey ? 'A key is saved; paste a new one to replace it' : undefined}
              />
            </Field>
            {hasSavedKey && !key.trim() && <Text>Your saved {provider.displayName} key will be used.</Text>}
            <div>
              <Button type="submit" color="brand" disabled={isChecking || !provider || (!key.trim() && !hasSavedKey)}>
                {isChecking ? `Checking with ${provider?.displayName}…` : 'Continue'}
              </Button>
            </div>
          </>
        )}
      </form>
    </SetupFrame>
  )
}
