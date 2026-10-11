import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertActions, AlertBody, AlertDescription, AlertTitle } from '@/components/alert'
import { Button } from '@/components/button'
import { PageMeta } from '@/components/page-meta'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@/components/dialog'
import { Description, Field, FieldGroup, Fieldset, Label } from '@/components/fieldset'
import { Heading, Subheading } from '@/components/heading'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import {
  createSecret,
  deleteSecret,
  listAllSecrets,
  listSecretUses,
  getSecretStorageDefaults,
  updateSecret,
  type Secret,
  type SecretLocation,
  type SecretStorageDefaults,
  type SecretUse,
} from '@/service/api/secret-api'
import { PlusIcon } from '@radix-ui/react-icons'
import { getClankers, type Clanker } from '@/service/api/clanker-api'
import { SecretsTable } from './secrets-table'
import { collectSecretUsers, describeSecretUsers } from './secretUsers'
import { SsmPathField } from './ssm-path-field'
import { CloudAccountsSection } from './cloud-accounts-section'
import { ENV_VAR_NAME_PATTERN, MODEL_PROVIDERS, type ModelProviderId } from '@viberglass/types'

type SecretFormState = {
  name: string
  secretLocation: SecretLocation
  secretPath: string
  sourceEnvVar: string
  provider: ModelProviderId | ''
  secretValue: string
}

const locationOptions: Array<{ value: SecretLocation; label: string; helper: string }> = [
  {
    value: 'database',
    label: 'Store the value (encrypted)',
    helper: 'Stores the secret value encrypted at rest in the platform database.',
  },
  {
    value: 'env',
    label: 'Server environment variable (advanced)',
    helper:
      'Reads the value from an environment variable on the Viberglass server. The variable must already be set there.',
  },
  {
    value: 'ssm',
    label: 'AWS SSM Parameter Store',
    helper: 'Stores the secret in AWS SSM as a SecureString parameter.',
  },
]

const emptyForm: SecretFormState = {
  name: '',
  secretLocation: 'database',
  secretPath: '',
  sourceEnvVar: '',
  provider: '',
  secretValue: '',
}

// The select can't hold an empty value, so "no provider" needs a value of its own.
const NO_PROVIDER = 'none'

function isModelProvider(value: string): value is ModelProviderId {
  return MODEL_PROVIDERS.some((provider) => provider.id === value)
}

export function SecretsPage() {
  const [secrets, setSecrets] = useState<Secret[]>([])
  const [runners, setRunners] = useState<Clanker[]>([])
  const [uses, setUses] = useState<SecretUse[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [formState, setFormState] = useState<SecretFormState>(emptyForm)
  const [activeSecret, setActiveSecret] = useState<Secret | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [secretToDelete, setSecretToDelete] = useState<Secret | null>(null)

  const [storageDefaults, setStorageDefaults] = useState<SecretStorageDefaults | null>(null)
  const modelKeys = secrets.filter((secret) => secret.provider && !secret.purpose)
  const logins = secrets.filter((secret) => secret.purpose === 'codex_login')
  const otherSecrets = secrets.filter((secret) => !secret.provider && !secret.purpose)
  const usedBy = useMemo(() => collectSecretUsers(runners, uses), [runners, uses])
  const showStorage = secrets.some((secret) => secret.secretLocation !== 'database')
  const usersOfSecretToDelete = describeSecretUsers(secretToDelete ? usedBy.get(secretToDelete.id) : undefined)
  const locationHelper = useMemo(() => {
    return locationOptions.find((option) => option.value === formState.secretLocation)?.helper || ''
  }, [formState.secretLocation])

  useEffect(() => {
    void loadSecrets()
    getSecretStorageDefaults()
      .then(setStorageDefaults)
      .catch(() => undefined)
  }, [])

  async function loadSecrets() {
    setLoading(true)
    try {
      const [data, runners, uses] = await Promise.all([
        listAllSecrets(),
        getClankers(100).catch(() => []),
        listSecretUses().catch(() => []),
      ])
      setSecrets(data)
      setRunners(runners)
      setUses(uses)
    } catch (error) {
      toast.error('Failed to load secrets', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setLoading(false)
    }
  }

  function openCreateDialog() {
    setDialogMode('create')
    setActiveSecret(null)
    setFormState({ ...emptyForm, secretLocation: storageDefaults?.location ?? emptyForm.secretLocation })
    setDialogOpen(true)
  }

  function openEditDialog(secret: Secret) {
    setDialogMode('edit')
    setActiveSecret(secret)
    setFormState({
      name: secret.name,
      secretLocation: secret.secretLocation,
      secretPath: secret.secretPath || '',
      sourceEnvVar: secret.sourceEnvVar || '',
      provider: secret.provider || '',
      secretValue: '',
    })
    setDialogOpen(true)
  }

  function closeDialog() {
    if (isSubmitting) return
    setDialogOpen(false)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedName = formState.name.trim()
    if (!trimmedName) {
      toast.error('Secret name is required')
      return
    }

    const sourceEnvVar = formState.sourceEnvVar.trim()
    if (formState.secretLocation === 'env' && !ENV_VAR_NAME_PATTERN.test(sourceEnvVar)) {
      toast.error('Name the server environment variable, e.g. ANTHROPIC_API_KEY')
      return
    }

    const isCreate = dialogMode === 'create'
    const locationChanged = activeSecret && activeSecret.secretLocation !== formState.secretLocation
    const requiresValue = formState.secretLocation !== 'env' && (isCreate || locationChanged)

    if (requiresValue && formState.secretValue.trim() === '') {
      toast.error('Secret value is required for this storage option')
      return
    }

    const payload = {
      name: trimmedName,
      secretLocation: formState.secretLocation,
      secretPath:
        formState.secretLocation === 'ssm' && formState.secretPath.trim()
          ? formState.secretPath.trim()
          : undefined,
      sourceEnvVar: formState.secretLocation === 'env' ? sourceEnvVar : null,
      provider: formState.provider || null,
      secretValue:
        formState.secretLocation !== 'env' && formState.secretValue.trim() !== ''
          ? formState.secretValue
          : undefined,
    }

    setIsSubmitting(true)
    try {
      if (dialogMode === 'create') {
        await createSecret(payload)
        toast.success('Secret created')
      } else if (activeSecret) {
        await updateSecret(activeSecret.id, payload)
        toast.success('Secret updated')
      }

      setDialogOpen(false)
      setFormState(emptyForm)
      await loadSecrets()
    } catch (error) {
      toast.error('Failed to save secret', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleDelete(secret: Secret) {
    setSecretToDelete(secret)
    setDeleteDialogOpen(true)
  }

  async function confirmDelete() {
    if (!secretToDelete) return

    try {
      await deleteSecret(secretToDelete.id)
      toast.success('Secret deleted')
      setSecrets((prev) => prev.filter((item) => item.id !== secretToDelete.id))
    } catch (error) {
      toast.error('Failed to delete secret', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setDeleteDialogOpen(false)
      setSecretToDelete(null)
    }
  }

  return (
    <>
      <PageMeta title="Secrets" />
      <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <Heading>Secrets</Heading>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Keys and tokens your agents, spaces and connections use.
          </p>
        </div>
        <Button color="brand" onClick={openCreateDialog}>
          <PlusIcon />
          Add secret
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-zinc-500 dark:text-zinc-400">Loading...</div>
        </div>
      ) : secrets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <h3 className="text-lg font-semibold text-zinc-950 dark:text-white">No secrets yet</h3>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Model keys and repository tokens you add here can be picked by agents and spaces.
          </p>
        </div>
      ) : (
        <>
          {modelKeys.length > 0 && (
            <section className="space-y-3">
              <Subheading>Model keys</Subheading>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                AI provider keys. Agents pick one in their Model section; one key can serve several agents.
              </p>
              <SecretsTable secrets={modelKeys} usedBy={usedBy} showStorage={showStorage} onEdit={openEditDialog} onDelete={handleDelete} />
            </section>
          )}
          {logins.length > 0 && (
            <section className="space-y-3">
              <Subheading>ChatGPT logins</Subheading>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Codex agents keep these signed in. Reconnect an agent from its page; deleting a login signs the agent out.
              </p>
              <SecretsTable secrets={logins} usedBy={usedBy} showStorage={showStorage} onEdit={openEditDialog} onDelete={handleDelete} />
            </section>
          )}
          {otherSecrets.length > 0 && (
            <section className="space-y-3">
              <Subheading>Other secrets</Subheading>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Repository tokens, connection credentials, and variables agents get.
              </p>
              <SecretsTable secrets={otherSecrets} usedBy={usedBy} showStorage={showStorage} onEdit={openEditDialog} onDelete={handleDelete} />
            </section>
          )}
        </>
      )}

      <CloudAccountsSection />

      <Dialog open={dialogOpen} onClose={closeDialog} size="lg">
        <form onSubmit={handleSubmit}>
          <DialogTitle>{dialogMode === 'create' ? 'Add secret' : 'Edit secret'}</DialogTitle>
          <DialogDescription>
            {dialogMode === 'create'
              ? 'Choose how you want to store and resolve this secret.'
              : 'Update the secret metadata or rotate the value.'}
          </DialogDescription>

          <DialogBody>
            <Fieldset>
              <FieldGroup>
                <Field>
                  <Label>Name</Label>
                  <Description>
                    What you&apos;ll know it by. Agents choose the environment variable it&apos;s exposed as.
                  </Description>
                  <Input
                    value={formState.name}
                    onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Team Anthropic key"
                    required
                  />
                </Field>

                <Field>
                  <Label>Model key from</Label>
                  <Description>For an AI model key, the provider that issued it. Leave as none for other secrets.</Description>
                  <Select
                    value={formState.provider || NO_PROVIDER}
                    onChange={(value) =>
                      setFormState((prev) => ({ ...prev, provider: isModelProvider(value) ? value : '' }))
                    }
                  >
                    <option value={NO_PROVIDER}>None</option>
                    {MODEL_PROVIDERS.filter((provider) => provider.id !== 'fake').map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.displayName}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field>
                  <Label>Storage location</Label>
                  <Description>{locationHelper}</Description>
                  <Select
                    value={formState.secretLocation}
                    onChange={(value) =>
                      setFormState((prev) => ({
                        ...prev,
                        secretLocation: value as SecretLocation,
                        secretPath: value === 'ssm' ? prev.secretPath : '',
                        secretValue: '',
                      }))
                    }
                  >
                    {locationOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>

                {formState.secretLocation === 'ssm' && (
                  <SsmPathField
                    path={formState.secretPath}
                    storedPath={dialogMode === 'edit' ? activeSecret?.secretPath : null}
                    ssmPrefix={storageDefaults?.ssmPrefix ?? '/viberator/secrets'}
                    onChange={(secretPath) => setFormState((prev) => ({ ...prev, secretPath }))}
                  />
                )}

                {formState.secretLocation === 'env' && (
                  <Field>
                    <Label>Server environment variable</Label>
                    <Description>The variable on the Viberglass server that holds the value.</Description>
                    <Input
                      value={formState.sourceEnvVar}
                      onChange={(event) =>
                        setFormState((prev) => ({ ...prev, sourceEnvVar: event.target.value.toUpperCase() }))
                      }
                      placeholder="ANTHROPIC_API_KEY"
                      className="font-mono"
                    />
                  </Field>
                )}

                {formState.secretLocation !== 'env' && (
                  <Field>
                    <Label>Secret value</Label>
                    <Description>
                      {dialogMode === 'edit' ? 'Leave blank to keep the current value.' : 'Required for storage.'}
                    </Description>
                    <Input
                      type="password"
                      value={formState.secretValue}
                      onChange={(event) => setFormState((prev) => ({ ...prev, secretValue: event.target.value }))}
                      placeholder="••••••••"
                    />
                  </Field>
                )}
              </FieldGroup>
            </Fieldset>
          </DialogBody>

          <DialogActions>
            <Button outline onClick={closeDialog} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button color="brand" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : dialogMode === 'create' ? 'Add secret' : 'Save changes'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <Alert open={deleteDialogOpen} onClose={setDeleteDialogOpen}>
        <AlertTitle>Delete secret?</AlertTitle>
        <AlertDescription>
          Are you sure you want to delete <strong>{secretToDelete?.name}</strong>? This action cannot be undone.
        </AlertDescription>
        {usersOfSecretToDelete.length > 0 && (
          <AlertBody>
            <p className="text-sm">These lose access to it:</p>
            <ul className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {usersOfSecretToDelete.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </AlertBody>
        )}
        <AlertActions>
          <Button outline onClick={() => setDeleteDialogOpen(false)}>
            Cancel
          </Button>
          <Button color="red" onClick={confirmDelete}>
            Delete
          </Button>
        </AlertActions>
      </Alert>
    </div>
    </>
  )
}
