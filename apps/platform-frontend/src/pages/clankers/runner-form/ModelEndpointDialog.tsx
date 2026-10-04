import { Button } from '@/components/button'
import { Checkbox, CheckboxField } from '@/components/checkbox'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@/components/dialog'
import { Description, Field, FieldGroup, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { Textarea } from '@/components/textarea'
import { checkModelEndpoint, saveModelEndpoint } from '@/service/api/model-endpoint-api'
import { createSecret, getSecretStorageDefaults, type Secret } from '@/service/api/secret-api'
import { isModelApiFormat, isObjectRecord, type ModelEndpoint, type ModelEndpointInput } from '@viberglass/types'
import { useState } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  onSaved: (endpoint: ModelEndpoint) => void
  secrets: Secret[]
  formats: readonly string[]
  initial?: ModelEndpoint
}

export function ModelEndpointDialog({ open, onClose, onSaved, secrets, formats, initial }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? '')
  const [format, setFormat] = useState(initial?.apiFormat ?? formats[0] ?? 'openai-chat')
  const [auth, setAuth] = useState(initial?.auth.scheme ?? 'bearer')
  const [header, setHeader] = useState(initial?.auth.scheme === 'header' ? initial.auth.header : 'x-api-key')
  const [newKey, setNewKey] = useState('')
  const [addingKey, setAddingKey] = useState(false)
  const [availableSecrets, setAvailableSecrets] = useState(secrets)
  const [secretId, setSecretId] = useState(initial?.secretId ?? '')
  const [models, setModels] = useState(initial?.models.join('\n') ?? '')
  const [extraHeaders, setExtraHeaders] = useState(JSON.stringify(initial?.extraHeaders ?? {}, null, 2))
  const [mayColdStart, setMayColdStart] = useState(initial?.mayColdStart ?? false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const readOnly = initial?.source === 'deployment'

  function input(): ModelEndpointInput {
    const parsed: unknown = JSON.parse(extraHeaders)
    if (!isObjectRecord(parsed)) throw new Error('Extra headers must be a JSON object.')
    const headers: Record<string, string> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== 'string') throw new Error('Each header value must be text.')
      headers[key] = value
    }
    if (!isModelApiFormat(format)) throw new Error('Choose an API format.')
    return {
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      apiFormat: format,
      auth:
        auth === 'header' ? { scheme: 'header', header } : auth === 'none' ? { scheme: 'none' } : { scheme: 'bearer' },
      secretId: auth === 'none' ? null : secretId || null,
      extraHeaders: headers,
      models: Array.from(
        new Set(
          models
            .split('\n')
            .map((model) => model.trim())
            .filter(Boolean)
        )
      ),
      mayColdStart,
    }
  }

  async function perform(check: boolean) {
    setError(null)
    setMessage('')
    setBusy(true)
    try {
      const value = input()
      if (addingKey && auth !== 'none') {
        if (!newKey.trim()) throw new Error('Paste the API key.')
        const defaults = await getSecretStorageDefaults()
        const secret = await createSecret({
          name: `${name.trim()} key`,
          secretLocation: defaults.location,
          secretValue: newKey.trim(),
        })
        value.secretId = secret.id
        setSecretId(secret.id)
        setAvailableSecrets((previous) => [...previous, secret])
        setNewKey('')
        setAddingKey(false)
      }
      if (check) {
        const result = await checkModelEndpoint(value)
        if (result.discoverySupported) setModels(result.models.join('\n'))
        setMessage(
          result.discoverySupported
            ? `Found ${result.models.length} models.`
            : 'Model discovery is unavailable. Enter the model IDs below.'
        )
      } else onSaved(await saveModelEndpoint(value, initial?.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the endpoint')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!busy) onClose()
      }}
      size="lg"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          void perform(false)
        }}
      >
        <DialogTitle>{initial ? 'Edit model endpoint' : 'Add model endpoint'}</DialogTitle>
        <DialogDescription>
          {readOnly
            ? 'This endpoint belongs to a deployment. Manage it from the deployment.'
            : 'Connect a model API that your workspace controls. Other runners can use it too.'}
        </DialogDescription>
        <DialogBody>
          <FieldGroup>
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            {message && (
              <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
                {message}
              </p>
            )}
            <Field>
              <Label>Name</Label>
              <Input required value={name} onChange={(e) => setName(e.target.value)} disabled={readOnly} />
            </Field>
            <Field>
              <Label>Base URL</Label>
              <Description>Include the API prefix, such as /v1.</Description>
              <Input
                required
                type="url"
                placeholder="https://models.example.com/v1"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                disabled={readOnly}
              />
            </Field>
            <Field>
              <Label>API format</Label>
              <Select value={format} onChange={setFormat} disabled={readOnly}>
                {Array.from(new Set([...formats, ...(initial ? [initial.apiFormat] : [])])).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </Field>
            <Field>
              <Label>Authentication</Label>
              <Select
                value={auth}
                onChange={(value) => {
                  if (value === 'bearer' || value === 'header' || value === 'none') setAuth(value)
                }}
                disabled={readOnly}
              >
                <option value="bearer">Bearer token</option>
                <option value="header">Custom header</option>
                <option value="none">None (anonymous)</option>
              </Select>
            </Field>
            {auth === 'header' && (
              <Field>
                <Label>Auth header</Label>
                <Input required value={header} onChange={(e) => setHeader(e.target.value)} disabled={readOnly} />
              </Field>
            )}
            {auth !== 'none' && (
              <Field>
                <Label>Shared secret</Label>
                <Description>Choose a shared API key or add one here.</Description>
                <Select
                  value={secretId || 'none'}
                  onChange={(value) => setSecretId(value === 'none' ? '' : value)}
                  disabled={readOnly}
                >
                  <option value="none">Choose a secret</option>
                  {availableSecrets
                    .filter((secret) => !secret.purpose)
                    .map((secret) => (
                      <option key={secret.id} value={secret.id}>
                        {secret.name}
                      </option>
                    ))}
                </Select>
                <Button type="button" plain onClick={() => setAddingKey((previous) => !previous)} disabled={readOnly}>
                  {addingKey ? 'Use an existing secret' : 'Add a key'}
                </Button>
                {addingKey && (
                  <Input
                    type="password"
                    aria-label="New API key"
                    autoComplete="off"
                    value={newKey}
                    onChange={(event) => setNewKey(event.target.value)}
                  />
                )}
              </Field>
            )}
            <Field>
              <Label>Extra headers</Label>
              <Description>Non-secret headers as JSON. Store credentials in a shared secret.</Description>
              <Textarea
                rows={3}
                value={extraHeaders}
                onChange={(e) => setExtraHeaders(e.target.value)}
                disabled={readOnly}
              />
            </Field>
            <Button
              type="button"
              outline
              onClick={() => void perform(true)}
              disabled={busy || readOnly || !baseUrl || !name}
            >
              Check connection and discover models
            </Button>
            <Field>
              <Label>Model IDs</Label>
              <Description>One per line. You can enter IDs when discovery is unavailable.</Description>
              <Textarea
                required
                rows={4}
                value={models}
                onChange={(e) => setModels(e.target.value)}
                disabled={readOnly}
              />
            </Field>
            <CheckboxField>
              <Checkbox
                checked={mayColdStart}
                onChange={(value) => {
                  if (typeof value === 'boolean') setMayColdStart(value)
                }}
                disabled={readOnly}
              />
              <Label>May need time to wake up</Label>
            </CheckboxField>
          </FieldGroup>
        </DialogBody>
        <DialogActions>
          <Button type="button" plain onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" color="brand" disabled={busy || readOnly}>
            {busy ? 'Saving…' : 'Save endpoint'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
