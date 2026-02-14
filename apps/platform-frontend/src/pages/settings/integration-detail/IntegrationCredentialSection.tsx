import { Button } from '@/components/button'
import { Description, Field, FieldGroup, Fieldset, Label } from '@/components/fieldset'
import { Subheading } from '@/components/heading'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { Switch, SwitchField } from '@/components/switch'
import { Text } from '@/components/text'
import {
  createIntegrationCredential,
  deleteIntegrationCredential,
  getIntegrationCredentials,
  updateIntegrationCredential,
} from '@/service/api/integration-api'
import { getSecrets, type Secret } from '@/service/api/secret-api'
import type { CreateIntegrationCredentialRequest, UpdateIntegrationCredentialRequest, IntegrationCredential, SecretLocation } from '@viberglass/types'
import { PlusIcon, TrashIcon } from '@radix-ui/react-icons'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

interface IntegrationCredentialSectionProps {
  integrationId: string
  integrationSystem: string
}

// Credential type is now automatically determined by the integration
// For SCM integrations (GitHub, GitLab, Bitbucket), credentials are always tokens

const LOCATION_OPTIONS: Array<{ value: SecretLocation; label: string; helper: string }> = [
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

const LOCATION_BADGES: Record<SecretLocation, { label: string; color: string }> = {
  env: { label: 'Env', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  database: { label: 'DB', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  ssm: { label: 'SSM', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
}

type SecretSource = 'existing' | 'new'

export function IntegrationCredentialSection({ integrationId, integrationSystem }: IntegrationCredentialSectionProps) {
  const [credentials, setCredentials] = useState<IntegrationCredential[]>([])
  const [secrets, setSecrets] = useState<Secret[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingSecrets, setIsLoadingSecrets] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  // Form state for new credential
  const [secretSource, setSecretSource] = useState<SecretSource>('existing')
  const [selectedSecretId, setSelectedSecretId] = useState('')
  const [newCredentialName, setNewCredentialName] = useState('')
  const [newCredentialLocation, setNewCredentialLocation] = useState<SecretLocation>('database')
  const [newCredentialPath, setNewCredentialPath] = useState('')
  const [newCredentialValue, setNewCredentialValue] = useState('')
  const [newCredentialIsDefault, setNewCredentialIsDefault] = useState(false)
  const [newCredentialDescription, setNewCredentialDescription] = useState('')

  // Editing state
  const [editingCredentialId, setEditingCredentialId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editIsDefault, setEditIsDefault] = useState(false)
  const [editSecretValue, setEditSecretValue] = useState('')

  const isScmIntegration = useMemo(() => {
    return ['github', 'gitlab', 'bitbucket'].includes(integrationSystem)
  }, [integrationSystem])

  // Get secrets not already linked to this integration
  const availableSecrets = useMemo(() => {
    const linkedSecretIds = new Set(credentials.map(c => c.secretId))
    return secrets.filter(s => !linkedSecretIds.has(s.id))
  }, [secrets, credentials])

  useEffect(() => {
    let isActive = true

    async function loadCredentials() {
      if (!integrationId) {
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      try {
        const data = await getIntegrationCredentials(integrationId)
        if (isActive) {
          setCredentials(data)
        }
      } catch (error) {
        console.error('Failed to load credentials:', error)
        if (isActive) {
          setCredentials([])
        }
      } finally {
        if (isActive) {
          setIsLoading(false)
        }
      }
    }

    void loadCredentials()

    return () => {
      isActive = false
    }
  }, [integrationId])

  const loadSecrets = async () => {
    setIsLoadingSecrets(true)
    try {
      const data = await getSecrets(100, 0)
      setSecrets(data)
    } catch (error) {
      console.error('Failed to load secrets:', error)
      toast.error('Failed to load secrets')
    } finally {
      setIsLoadingSecrets(false)
    }
  }

  const handleStartCreate = () => {
    setIsCreating(true)
    setSecretSource('existing')
    setSelectedSecretId('')
    setNewCredentialName('')
    setNewCredentialLocation('database')
    setNewCredentialPath('')
    setNewCredentialValue('')
    setNewCredentialIsDefault(false)
    setNewCredentialDescription('')
    void loadSecrets()
  }

  const handleCancelCreate = () => {
    setIsCreating(false)
  }

  const handleCreate = async () => {
    if (!newCredentialName.trim()) {
      toast.error('Credential name is required')
      return
    }

    setIsSubmitting(true)
    try {
      let request: CreateIntegrationCredentialRequest

      if (secretSource === 'existing' && selectedSecretId) {
        // Link to existing secret
        request = {
          integrationId,
          name: newCredentialName.trim(),
          secretId: selectedSecretId,
          isDefault: newCredentialIsDefault,
          description: newCredentialDescription.trim() || null,
        }
      } else {
        // Validate for new secret creation
        if (newCredentialLocation !== 'env' && !newCredentialValue.trim()) {
          toast.error('Credential value is required for this storage option')
          setIsSubmitting(false)
          return
        }

        // Create new secret
        request = {
          integrationId,
          name: newCredentialName.trim(),
          secretLocation: newCredentialLocation,
          secretValue: newCredentialLocation !== 'env' ? newCredentialValue.trim() : undefined,
          secretPath: newCredentialLocation === 'ssm' && newCredentialPath.trim() ? newCredentialPath.trim() : undefined,
          isDefault: newCredentialIsDefault,
          description: newCredentialDescription.trim() || null,
        }
      }

      const created = await createIntegrationCredential(integrationId, request)
      setCredentials((prev) => [...prev, created])
      setIsCreating(false)
      toast.success('Credential created successfully')
    } catch (error) {
      console.error('Failed to create credential:', error)
      toast.error('Failed to create credential', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleStartEdit = (credential: IntegrationCredential) => {
    setEditingCredentialId(credential.id)
    setEditName(credential.name)
    setEditDescription(credential.description || '')
    setEditIsDefault(credential.isDefault)
    setEditSecretValue('')
  }

  const handleCancelEdit = () => {
    setEditingCredentialId(null)
  }

  const handleUpdate = async (credentialId: string) => {
    setIsSubmitting(true)
    try {
      const request: UpdateIntegrationCredentialRequest = {
        name: editName.trim(),
        description: editDescription.trim() || null,
        isDefault: editIsDefault,
        ...(editSecretValue.trim() ? { secretValue: editSecretValue.trim() } : {}),
      }

      const updated = await updateIntegrationCredential(integrationId, credentialId, request)
      setCredentials((prev) => prev.map((c) => (c.id === credentialId ? updated : c)))
      setEditingCredentialId(null)
      toast.success('Credential updated successfully')
    } catch (error) {
      console.error('Failed to update credential:', error)
      toast.error('Failed to update credential', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (credentialId: string) => {
    const credential = credentials.find((c) => c.id === credentialId)
    if (!credential) return

    if (!window.confirm(`Are you sure you want to delete the credential "${credential.name}"?`)) {
      return
    }

    setIsSubmitting(true)
    try {
      await deleteIntegrationCredential(integrationId, credentialId)
      setCredentials((prev) => prev.filter((c) => c.id !== credentialId))
      toast.success('Credential deleted successfully')
    } catch (error) {
      console.error('Failed to delete credential:', error)
      toast.error('Failed to delete credential', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const locationHelper = useMemo(() => {
    return LOCATION_OPTIONS.find((option) => option.value === newCredentialLocation)?.helper || ''
  }, [newCredentialLocation])

  // Get secret name by ID
  const getSecretName = (secretId: string) => {
    const secret = secrets.find(s => s.id === secretId)
    return secret?.name || 'Unknown'
  }

  if (!isScmIntegration) {
    return null
  }

  return (
    <section className="app-frame rounded-lg p-6">
      <div className="flex items-center justify-between">
        <div>
          <Subheading>Integration Credentials</Subheading>
          <Text className="text-sm text-[var(--gray-9)]">
            Manage credentials used by projects linked to this {integrationSystem} integration.
          </Text>
        </div>
        {!isCreating && (
          <Button color="brand" onClick={handleStartCreate} disabled={isLoading}>
            <PlusIcon className="mr-1 size-4" />
            Add Credential
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="mt-4 text-sm text-[var(--gray-9)]">Loading credentials...</div>
      ) : (
        <div className="mt-6 space-y-6">
          {credentials.length === 0 && !isCreating && (
            <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center dark:border-zinc-700 dark:bg-zinc-900">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
                <PlusIcon className="size-6 text-zinc-400" />
              </div>
              <h3 className="mt-4 text-sm font-semibold text-zinc-950 dark:text-white">No credentials configured</h3>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Add a credential to enable SCM authentication for linked projects.
              </p>
              <Button color="brand" className="mt-4" onClick={handleStartCreate}>
                Add Credential
              </Button>
            </div>
          )}

          {credentials.length > 0 && (
            <div className="space-y-4">
              {credentials.map((credential) => (
                <div
                  key={credential.id}
                  className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  {editingCredentialId === credential.id ? (
                    <Fieldset disabled={isSubmitting}>
                      <FieldGroup className="space-y-4">
                        <Field>
                          <Label>Name</Label>
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder="e.g. Production Deploy Key"
                          />
                        </Field>
                        <Field>
                          <Label>Description</Label>
                          <Input
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            placeholder="Optional description"
                          />
                        </Field>
                        <Field>
                          <Label>New Secret Value (optional)</Label>
                          <Description>Leave blank to keep the current value. Only for database/SSM storage.</Description>
                          <Input
                            type="password"
                            value={editSecretValue}
                            onChange={(e) => setEditSecretValue(e.target.value)}
                            placeholder="Enter new value to rotate"
                          />
                        </Field>
                        <SwitchField>
                          <Label>Set as default credential</Label>
                          <Description>
                            The default credential is automatically selected when configuring SCM for projects.
                          </Description>
                          <Switch checked={editIsDefault} onChange={setEditIsDefault} />
                        </SwitchField>
                        <div className="flex gap-2 pt-2">
                          <Button color="brand" onClick={() => handleUpdate(credential.id)} disabled={isSubmitting}>
                            {isSubmitting ? 'Saving...' : 'Save Changes'}
                          </Button>
                          <Button plain onClick={handleCancelEdit} disabled={isSubmitting}>
                            Cancel
                          </Button>
                        </div>
                      </FieldGroup>
                    </Fieldset>
                  ) : (
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-zinc-950 dark:text-white">{credential.name}</h4>
                          {credential.isDefault && (
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                              Default
                            </span>
                          )}
                          <span className={`rounded px-2 py-0.5 text-xs font-medium ${LOCATION_BADGES[credential.secretLocation].color}`}>
                            {LOCATION_BADGES[credential.secretLocation].label}
                          </span>
                        </div>
                        {credential.description && (
                          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{credential.description}</p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                          <span className="rounded bg-zinc-100 px-2 py-1 dark:bg-zinc-800">
                            Secret: {getSecretName(credential.secretId)}
                          </span>
                          <span className="rounded bg-zinc-100 px-2 py-1 dark:bg-zinc-800">
                            Created: {new Date(credential.createdAt).toLocaleDateString()}
                          </span>
                          {credential.lastUsedAt && (
                            <span className="rounded bg-zinc-100 px-2 py-1 dark:bg-zinc-800">
                              Last used: {new Date(credential.lastUsedAt).toLocaleDateString()}
                            </span>
                          )}
                          {credential.expiresAt && (
                            <span
                              className={`rounded px-2 py-1 ${
                                new Date(credential.expiresAt) < new Date()
                                  ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                  : 'bg-zinc-100 dark:bg-zinc-800'
                              }`}
                            >
                              Expires: {new Date(credential.expiresAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button plain onClick={() => handleStartEdit(credential)} disabled={isSubmitting}>
                          Edit
                        </Button>
                        <Button
                          outline
                          onClick={() => handleDelete(credential.id)}
                          disabled={isSubmitting}
                        >
                          <TrashIcon className="size-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {isCreating && (
            <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <h4 className="text-sm font-semibold text-zinc-950 dark:text-white">Add New Credential</h4>
              <Fieldset disabled={isSubmitting} className="mt-4">
                <FieldGroup className="space-y-4">
                  {/* Secret Source Selection */}
                  <Field>
                    <Label>Secret Source</Label>
                    <Description>Choose whether to use an existing secret or create a new one.</Description>
                    <Select
                      value={secretSource}
                      onChange={(value) => {
                        setSecretSource(value as SecretSource)
                        setSelectedSecretId('')
                        setNewCredentialValue('')
                      }}
                    >
                      <option value="existing">Use existing secret</option>
                      <option value="new">Create new secret</option>
                    </Select>
                  </Field>

                  {/* Existing Secret Selection */}
                  {secretSource === 'existing' && (
                    <Field>
                      <Label>Select Secret</Label>
                      <Description>
                        {isLoadingSecrets 
                          ? 'Loading secrets...' 
                          : availableSecrets.length === 0 
                            ? 'No available secrets. Create one in the Secrets page first.' 
                            : 'Choose a secret from the Secrets page.'}
                      </Description>
                      <Select
                        value={selectedSecretId || '__placeholder__'}
                        onChange={(value) => {
                          const actualValue = value === '__placeholder__' ? '' : value
                          setSelectedSecretId(actualValue)
                          // Auto-fill name from secret if empty
                          const secret = secrets.find(s => s.id === actualValue)
                          if (secret && !newCredentialName) {
                            setNewCredentialName(secret.name)
                          }
                        }}
                        disabled={isLoadingSecrets || availableSecrets.length === 0}
                      >
                        <option value="__placeholder__">{isLoadingSecrets ? 'Loading...' : 'Select a secret...'}</option>
                        {availableSecrets.map((secret) => (
                          <option key={secret.id} value={secret.id}>
                            {secret.name} ({secret.secretLocation})
                          </option>
                        ))}
                      </Select>
                    </Field>
                  )}

                  {/* New Secret Creation Fields */}
                  {secretSource === 'new' && (
                    <>
                      <Field>
                        <Label>Storage Location</Label>
                        <Description>{locationHelper}</Description>
                        <Select
                          value={newCredentialLocation}
                          onChange={(value) => {
                            setNewCredentialLocation(value as SecretLocation)
                            setNewCredentialPath('')
                            setNewCredentialValue('')
                          }}
                        >
                          {LOCATION_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      {newCredentialLocation === 'ssm' && (
                        <Field>
                          <Label>SSM Parameter Path (Optional)</Label>
                          <Description>Defaults to /viberator/secrets/{'{credential-name}'}</Description>
                          <Input
                            value={newCredentialPath}
                            onChange={(e) => setNewCredentialPath(e.target.value)}
                            placeholder="/viberator/secrets/GITHUB_PROD_TOKEN"
                          />
                        </Field>
                      )}
                      {newCredentialLocation !== 'env' && (
                        <Field>
                          <Label>Credential Value</Label>
                          <Description>The secret value (token, key, or password).</Description>
                          <Input
                            type="password"
                            value={newCredentialValue}
                            onChange={(e) => setNewCredentialValue(e.target.value)}
                            placeholder="Enter credential value"
                          />
                        </Field>
                      )}
                    </>
                  )}

                  {/* Common Fields */}
                  <Field>
                    <Label>Credential Name</Label>
                    <Description>A descriptive name for this credential. Must be a valid environment variable key.</Description>
                    <Input
                      value={newCredentialName}
                      onChange={(e) => setNewCredentialName(e.target.value)}
                      placeholder="e.g. GITHUB_PROD_TOKEN"
                    />
                  </Field>

                  <Field>
                    <Label>Description (Optional)</Label>
                    <Input
                      value={newCredentialDescription}
                      onChange={(e) => setNewCredentialDescription(e.target.value)}
                      placeholder="e.g. Used for production deployments"
                    />
                  </Field>

                  <SwitchField>
                    <Label>Set as default credential</Label>
                    <Description>
                      The default credential is automatically selected when configuring SCM for projects.
                    </Description>
                    <Switch checked={newCredentialIsDefault} onChange={setNewCredentialIsDefault} />
                  </SwitchField>

                  <div className="flex gap-2 pt-2">
                    <Button 
                      color="brand" 
                      onClick={handleCreate} 
                      disabled={isSubmitting || (secretSource === 'existing' && !selectedSecretId)}
                    >
                      {isSubmitting ? 'Creating...' : 'Create Credential'}
                    </Button>
                    <Button plain onClick={handleCancelCreate} disabled={isSubmitting}>
                      Cancel
                    </Button>
                  </div>
                </FieldGroup>
              </Fieldset>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
