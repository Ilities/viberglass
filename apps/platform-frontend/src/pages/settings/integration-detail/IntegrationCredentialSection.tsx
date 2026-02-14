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
import type { CreateIntegrationCredentialRequest, UpdateIntegrationCredentialRequest, IntegrationCredential } from '@viberglass/types'
import { PlusIcon, TrashIcon } from '@radix-ui/react-icons'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

interface IntegrationCredentialSectionProps {
  integrationId: string
  integrationSystem: string
}

const NONE_OPTION = '__none__'

const CREDENTIAL_TYPE_OPTIONS: Array<{ value: CreateIntegrationCredentialRequest['credentialType']; label: string }> = [
  { value: 'token', label: 'Token' },
  { value: 'ssh_key', label: 'SSH Key' },
  { value: 'oauth', label: 'OAuth' },
  { value: 'basic', label: 'Basic Auth' },
]

export function IntegrationCredentialSection({ integrationId, integrationSystem }: IntegrationCredentialSectionProps) {
  const [credentials, setCredentials] = useState<IntegrationCredential[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  // Form state for new credential
  const [newCredentialName, setNewCredentialName] = useState('')
  const [newCredentialType, setNewCredentialType] = useState<CreateIntegrationCredentialRequest['credentialType']>('token')
  const [newCredentialValue, setNewCredentialValue] = useState('')
  const [newCredentialIsDefault, setNewCredentialIsDefault] = useState(false)
  const [newCredentialDescription, setNewCredentialDescription] = useState('')

  // Editing state
  const [editingCredentialId, setEditingCredentialId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editIsDefault, setEditIsDefault] = useState(false)

  const isScmIntegration = useMemo(() => {
    return ['github', 'gitlab', 'bitbucket'].includes(integrationSystem)
  }, [integrationSystem])

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

  const handleStartCreate = () => {
    setIsCreating(true)
    setNewCredentialName('')
    setNewCredentialType('token')
    setNewCredentialValue('')
    setNewCredentialIsDefault(false)
    setNewCredentialDescription('')
  }

  const handleCancelCreate = () => {
    setIsCreating(false)
  }

  const handleCreate = async () => {
    if (!newCredentialName.trim()) {
      toast.error('Credential name is required')
      return
    }
    if (!newCredentialValue.trim()) {
      toast.error('Credential value is required')
      return
    }

    setIsSubmitting(true)
    try {
      const request: CreateIntegrationCredentialRequest = {
        integrationId,
        name: newCredentialName.trim(),
        credentialType: newCredentialType,
        secretValue: newCredentialValue.trim(),
        isDefault: newCredentialIsDefault,
        description: newCredentialDescription.trim() || null,
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
                        </div>
                        {credential.description && (
                          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{credential.description}</p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                          <span className="rounded bg-zinc-100 px-2 py-1 dark:bg-zinc-800">
                            Type: {CREDENTIAL_TYPE_OPTIONS.find((o) => o.value === credential.credentialType)?.label || credential.credentialType}
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
                  <Field>
                    <Label>Name</Label>
                    <Description>A descriptive name for this credential.</Description>
                    <Input
                      value={newCredentialName}
                      onChange={(e) => setNewCredentialName(e.target.value)}
                      placeholder="e.g. Production Deploy Key"
                    />
                  </Field>
                  <Field>
                    <Label>Credential Type</Label>
                    <Description>Select the type of credential.</Description>
                    <Select
                      value={newCredentialType}
                      onChange={(value) =>
                        setNewCredentialType(value as CreateIntegrationCredentialRequest['credentialType'])
                      }
                    >
                      {CREDENTIAL_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
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
                    <Button color="brand" onClick={handleCreate} disabled={isSubmitting}>
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
