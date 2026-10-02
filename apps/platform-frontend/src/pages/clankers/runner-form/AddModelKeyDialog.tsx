import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@/components/dialog'
import { Description, Field, FieldGroup, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { checkModelKey, createSecret, getSecretStorageDefaults, type Secret } from '@/service/api/secret-api'
import { getModelProvider, type ModelProviderId } from '@viberglass/types'
import { useState } from 'react'

interface AddModelKeyDialogProps {
  provider: ModelProviderId
  open: boolean
  onClose: () => void
  onAdded: (secret: Secret) => void
}

/** Adds a key from one provider without leaving the runner form: checked with the provider, then stored. */
export function AddModelKeyDialog({ provider, open, onClose, onAdded }: AddModelKeyDialogProps) {
  const providerInfo = getModelProvider(provider)
  const [name, setName] = useState(`${providerInfo.displayName} key`)
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  function close() {
    if (isSaving) return
    setKey('')
    setError(null)
    onClose()
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    // The dialog sits inside the runner form; keep its submit from saving the runner.
    event.preventDefault()
    event.stopPropagation()
    setError(null)
    setIsSaving(true)
    try {
      await checkModelKey(provider, key)
      const defaults = await getSecretStorageDefaults()
      const secret = await createSecret({
        name: name.trim() || `${providerInfo.displayName} key`,
        provider,
        secretLocation: defaults.location,
        secretValue: key.trim(),
      })
      setKey('')
      onAdded(secret)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add the key")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={close} size="lg">
      <form onSubmit={handleSubmit}>
        <DialogTitle>Add a {providerInfo.displayName} key</DialogTitle>
        <DialogDescription>
          It&apos;s checked with {providerInfo.displayName} and stored encrypted. Other runners can use it too.{' '}
          <a href={providerInfo.keyUrl} target="_blank" rel="noreferrer" className="underline">
            Get a key
          </a>
          .
        </DialogDescription>
        <DialogBody>
          <FieldGroup>
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
                {error}
              </div>
            )}
            <Field>
              <Label>Name</Label>
              <Description>What you&apos;ll know it by, e.g. which account or team it belongs to.</Description>
              <Input value={name} onChange={(event) => setName(event.target.value)} required />
            </Field>
            <Field>
              <Label>API key</Label>
              <Input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={key}
                onChange={(event) => setKey(event.target.value)}
                required
              />
            </Field>
          </FieldGroup>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={close} disabled={isSaving}>
            Cancel
          </Button>
          <Button color="brand" type="submit" disabled={isSaving || !key.trim()}>
            {isSaving ? `Checking with ${providerInfo.displayName}…` : 'Add key'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
