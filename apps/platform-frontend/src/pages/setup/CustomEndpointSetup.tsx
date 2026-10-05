import { Button } from '@/components/button'
import { Description, Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { checkModelEndpoint, saveModelEndpoint } from '@/service/api/model-endpoint-api'
import { createSecret, getSecretStorageDefaults } from '@/service/api/secret-api'
import { AGENT_LABELS, agentForModelApiFormat, isModelApiFormat, type ModelApiFormat, type ModelEndpointInput } from '@viberglass/types'
import { useId, useState } from 'react'
import { SetupError } from './SetupFrame'

const FORMAT_LABEL: Record<ModelApiFormat, string> = {
  'openai-chat': 'OpenAI-compatible Chat Completions',
  'openai-responses': 'OpenAI Responses',
  'anthropic-messages': 'Anthropic Messages',
}

const FORMATS: ModelApiFormat[] = ['openai-chat', 'openai-responses', 'anthropic-messages']

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/**
 * A model API the workspace controls, as setup's model: its address, the API
 * it speaks, its own key and the model to run. The key is stored as the
 * endpoint's, never as some vendor's, and the endpoint is checked before setup
 * goes on. The harness follows from the API: not every agent can use one.
 */
export function CustomEndpointSetup({ onDone }: { onDone: (endpointId: string, model: string) => void }) {
  const modelListId = useId()
  const [baseUrl, setBaseUrl] = useState('')
  const [format, setFormat] = useState<ModelApiFormat>('openai-chat')
  const [key, setKey] = useState('')
  const [model, setModel] = useState('')
  const [found, setFound] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // The key is stored once per value typed, so trying again doesn't leave copies behind.
  const [storedKey, setStoredKey] = useState<{ value: string; secretId: string } | null>(null)
  const agent = agentForModelApiFormat(format)

  async function input(): Promise<ModelEndpointInput> {
    const url = baseUrl.trim()
    if (!/^https?:\/\//.test(url)) throw new Error('Enter the API base URL, starting with https://, e.g. https://api.z.ai/api/paas/v4.')
    if (!key.trim()) throw new Error('Paste the API key for this endpoint.')
    let secretId = storedKey?.value === key.trim() ? storedKey.secretId : null
    if (!secretId) {
      const defaults = await getSecretStorageDefaults()
      const secret = await createSecret({ name: `${hostOf(url)} key`, secretLocation: defaults.location, secretValue: key.trim() })
      secretId = secret.id
      setStoredKey({ value: key.trim(), secretId })
    }
    return {
      name: hostOf(url),
      baseUrl: url,
      apiFormat: format,
      auth: format === 'anthropic-messages' ? { scheme: 'header', header: 'x-api-key' } : { scheme: 'bearer' },
      secretId,
      extraHeaders: {},
      models: model.trim() ? [model.trim()] : [],
      mayColdStart: false,
    }
  }

  async function run(action: () => Promise<void>) {
    setError(null)
    setBusy(true)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't check the endpoint.")
    } finally {
      setBusy(false)
    }
  }

  const findModels = () =>
    run(async () => {
      const result = await checkModelEndpoint(await input())
      setFound(result.models)
      if (!model.trim() && result.models[0]) setModel(result.models[0])
      if (!result.discoverySupported) setError("The key was accepted, but this endpoint doesn't list its models. Type the model's ID.")
    })

  const save = () =>
    run(async () => {
      const chosen = model.trim()
      if (!chosen) throw new Error("Enter the model to run, e.g. glm-4.7-flash, or press Find models.")
      const value = await input()
      const result = await checkModelEndpoint(value)
      if (result.discoverySupported && !result.models.includes(chosen)) {
        throw new Error(`This endpoint doesn't list ${chosen}. It lists ${result.models.slice(0, 5).join(', ')}${result.models.length > 5 ? '…' : ''}.`)
      }
      const endpoint = await saveModelEndpoint({ ...value, models: Array.from(new Set([chosen, ...result.models])) })
      onDone(endpoint.id, chosen)
    })

  return (
    <div className="grid gap-6">
      <SetupError message={error} />
      <Field>
        <Label>API base URL</Label>
        <Input type="url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.z.ai/api/paas/v4" />
      </Field>
      <Field>
        <Label>API it speaks</Label>
        <Select value={format} onChange={(value) => isModelApiFormat(value) && setFormat(value)} aria-label="API it speaks">
          {FORMATS.map((option) => (
            <option key={option} value={option}>
              {FORMAT_LABEL[option]}
            </option>
          ))}
        </Select>
        <Description>
          {agent
            ? `Agents run it on ${AGENT_LABELS[agent]}. Claude Code, Codex and the others use only their own providers here for now.`
            : 'No agent here speaks this API yet.'}
        </Description>
      </Field>
      <Field>
        <Label>API key</Label>
        <Input type="password" autoComplete="off" spellCheck={false} value={key} onChange={(event) => setKey(event.target.value)} />
        <Description>Stored encrypted as this endpoint&apos;s key, not as any vendor&apos;s.</Description>
      </Field>
      <Field>
        <div className="flex items-center justify-between">
          <Label>Model</Label>
          <Button type="button" plain disabled={busy} onClick={() => void findModels()}>
            Find models
          </Button>
        </div>
        <Input list={modelListId} value={model} onChange={(event) => setModel(event.target.value)} placeholder="glm-4.7-flash" />
        <datalist id={modelListId}>
          {found.map((entry) => (
            <option key={entry} value={entry} />
          ))}
        </datalist>
        {found.length > 0 && <Description>The key was accepted; the endpoint lists {found.length} models.</Description>}
      </Field>
      <div>
        <Button type="button" color="brand" disabled={busy || !agent} onClick={() => void save()}>
          {busy ? 'Checking the endpoint…' : 'Check and continue'}
        </Button>
      </div>
    </div>
  )
}
