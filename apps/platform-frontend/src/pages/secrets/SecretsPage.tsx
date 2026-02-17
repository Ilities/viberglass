import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertActions, AlertBody, AlertDescription, AlertTitle } from '@/components/alert'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { PageMeta } from '@/components/page-meta'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@/components/dialog'
import { Description, Field, FieldGroup, Fieldset, Label } from '@/components/fieldset'
import { Heading, Subheading } from '@/components/heading'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { formatTimestamp } from '@/lib/formatters'
import {
  createSecret,
  deleteSecret,
  getSecrets,
  updateSecret,
  type Secret,
  type SecretLocation,
} from '@/service/api/secret-api'
import { Pencil1Icon, PlusIcon, TrashIcon } from '@radix-ui/react-icons'
import { DEFAULT_SECRET_NAME_PRESET_GROUP_ID, SECRET_NAME_PRESET_GROUPS } from './secretNamePresets'

type SecretFormState = {
  name: string
  secretLocation: SecretLocation
  secretPath: string
  secretValue: string
}

const secretNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/

const locationOptions: Array<{ value: SecretLocation; label: string; helper: string }> = [
  {
    value: 'env',
    label: 'Name only (env)',
    helper: 'Reads the value from an existing environment variable on the API server.',
  },
  {
    value: 'database',
    label: 'Database (encrypted)',
    helper: 'Stores the secret value encrypted at rest in the platform database.',
  },
  {
    value: 'ssm',
    label: 'AWS SSM Parameter Store',
    helper: 'Stores the secret in AWS SSM as a SecureString parameter.',
  },
]

const badgeColors: Record<SecretLocation, 'green' | 'blue' | 'amber'> = {
  env: 'green',
  database: 'blue',
  ssm: 'amber',
}

const emptyForm: SecretFormState = {
  name: '',
  secretLocation: 'env',
  secretPath: '',
  secretValue: '',
}

export function SecretsPage() {
  const [secrets, setSecrets] = useState<Secret[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [formState, setFormState] = useState<SecretFormState>(emptyForm)
  const [activeSecret, setActiveSecret] = useState<Secret | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [secretToDelete, setSecretToDelete] = useState<Secret | null>(null)
  const [selectedPresetGroupId, setSelectedPresetGroupId] = useState(DEFAULT_SECRET_NAME_PRESET_GROUP_ID)

  const locationHelper = useMemo(() => {
    return locationOptions.find((option) => option.value === formState.secretLocation)?.helper || ''
  }, [formState.secretLocation])
  const selectedPresetGroup = useMemo(() => {
    return (
      SECRET_NAME_PRESET_GROUPS.find((group) => group.id === selectedPresetGroupId) || SECRET_NAME_PRESET_GROUPS[0]
    )
  }, [selectedPresetGroupId])

  useEffect(() => {
    void loadSecrets()
  }, [])

  async function loadSecrets() {
    setLoading(true)
    try {
      const data = await getSecrets()
      setSecrets(data)
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
    setFormState(emptyForm)
    setSelectedPresetGroupId(DEFAULT_SECRET_NAME_PRESET_GROUP_ID)
    setDialogOpen(true)
  }

  function openEditDialog(secret: Secret) {
    setDialogMode('edit')
    setActiveSecret(secret)
    setFormState({
      name: secret.name,
      secretLocation: secret.secretLocation,
      secretPath: secret.secretPath || '',
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

    if (!secretNamePattern.test(trimmedName)) {
      toast.error('Secret name must be a valid environment variable key')
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
            Store and manage environment secrets that are injected into worker invocations.
          </p>
        </div>
        <Button color="brand" onClick={openCreateDialog}>
          <PlusIcon />
          Add Secret
        </Button>
      </div>

      <Subheading>Configured secrets</Subheading>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-zinc-500 dark:text-zinc-400">Loading...</div>
        </div>
      ) : secrets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <h3 className="text-lg font-semibold text-zinc-950 dark:text-white">No secrets yet</h3>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Add a secret to securely inject credentials into worker containers.
          </p>
          <Button color="brand" className="mt-6" onClick={openCreateDialog}>
            <PlusIcon />
            Create Secret
          </Button>
        </div>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Name</TableHeader>
              <TableHeader>Storage</TableHeader>
              <TableHeader>Reference</TableHeader>
              <TableHeader>Updated</TableHeader>
              <TableHeader />
            </TableRow>
          </TableHead>
          <TableBody>
            {secrets.map((secret) => (
              <TableRow key={secret.id}>
                <TableCell className="font-medium text-zinc-950 dark:text-white">{secret.name}</TableCell>
                <TableCell>
                  <Badge color={badgeColors[secret.secretLocation]}>
                    {secret.secretLocation === 'env'
                      ? 'Env'
                      : secret.secretLocation === 'database'
                      ? 'Database'
                      : 'SSM'}
                  </Badge>
                </TableCell>
                <TableCell className="text-zinc-500 dark:text-zinc-400">
                  {secret.secretLocation === 'ssm' ? secret.secretPath || '—' : '—'}
                </TableCell>
                <TableCell className="text-zinc-500 dark:text-zinc-400">{formatTimestamp(secret.updatedAt)}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      plain
                      onClick={() => openEditDialog(secret)}
                      className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                    >
                      <Pencil1Icon className="h-4 w-4" />
                    </Button>
                    <Button
                      surface
                      color="red"
                      onClick={() => handleDelete(secret)}
                      aria-label="Delete secret"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onClose={closeDialog} size="lg">
        <form onSubmit={handleSubmit}>
          <DialogTitle>{dialogMode === 'create' ? 'Add Secret' : 'Edit Secret'}</DialogTitle>
          <DialogDescription>
            {dialogMode === 'create'
              ? 'Choose how you want to store and resolve this secret.'
              : 'Update the secret metadata or rotate the value.'}
          </DialogDescription>

          <DialogBody>
            <Fieldset>
              <FieldGroup>
                {dialogMode === 'create' && (
                  <Field>
                    <Label>Predefined values</Label>
                    <Description>Pick a clanker variant and click a value to autofill the secret name.</Description>
                    <div className="mt-3 space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
                      <Select value={selectedPresetGroup.id} onChange={setSelectedPresetGroupId}>
                        {SECRET_NAME_PRESET_GROUPS.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.label}
                          </option>
                        ))}
                      </Select>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">{selectedPresetGroup.helper}</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedPresetGroup.names.map((name) => (
                          <Button
                            key={name}
                            plain
                            size="small"
                            onClick={() => setFormState((prev) => ({ ...prev, name }))}
                          >
                            {name}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </Field>
                )}

                <Field>
                  <Label>Secret name</Label>
                  <Description>Must be a valid environment variable key.</Description>
                  <Input
                    value={formState.name}
                    onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="GITHUB_TOKEN"
                    required
                  />
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
                  <Field>
                    <Label>SSM parameter path</Label>
                    <Description>Optional. Defaults to the configured prefix plus the secret name.</Description>
                    <Input
                      value={formState.secretPath}
                      onChange={(event) => setFormState((prev) => ({ ...prev, secretPath: event.target.value }))}
                      placeholder="/viberator/secrets/GITHUB_TOKEN"
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
            <Button plain onClick={closeDialog} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button color="brand" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : dialogMode === 'create' ? 'Create Secret' : 'Save Changes'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <Alert open={deleteDialogOpen} onClose={setDeleteDialogOpen}>
        <AlertTitle>Delete secret?</AlertTitle>
        <AlertDescription>
          Are you sure you want to delete <strong>{secretToDelete?.name}</strong>? This action cannot be undone.
        </AlertDescription>
        <AlertBody>
          Workers will no longer receive this secret on invocation.
        </AlertBody>
        <AlertActions>
          <Button plain onClick={() => setDeleteDialogOpen(false)}>
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
