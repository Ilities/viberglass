import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/button'
import { Description, Field, FieldGroup, Fieldset, Label } from '@/components/fieldset'
import { Heading } from '@/components/heading'
import { Input } from '@/components/input'
import { Link } from '@/components/link'
import { PageMeta } from '@/components/page-meta'
import { Select } from '@/components/select'
import { Switch, SwitchField } from '@/components/switch'
import { Textarea } from '@/components/textarea'
import { getErrorMessage } from '@/lib/project-form'
import {
  getAvailableIntegrationTypes,
  getIntegrationCredentials,
  getIntegrations,
  linkIntegrationToProject,
} from '@/service/api/integration-api'
import {
  createProject,
  updateProject,
  upsertProjectScmConfig,
  type CreateProjectRequest,
} from '@/service/api/project-api'
import type { IntegrationCredential, TicketSystem } from '@viberglass/types'

const NONE_OPTION = '__none__'

function normalizeOptionalText(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

interface IntegrationOption {
  id: string
  name: string
  system: TicketSystem
  category: 'scm' | 'ticketing' | 'inbound'
}

export function NewProjectPage() {
  const navigate = useNavigate()

  const [autoFixEnabled, setAutoFixEnabled] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Track created project so a failed integration step can be retried without re-creating
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null)
  const [createdProjectSlug, setCreatedProjectSlug] = useState<string | null>(null)

  const [allIntegrations, setAllIntegrations] = useState<IntegrationOption[]>([])
  const [isLoadingIntegrations, setIsLoadingIntegrations] = useState(true)
  const [integrationLoadError, setIntegrationLoadError] = useState<string | null>(null)

  const [ticketingIntegrationId, setTicketingIntegrationId] = useState<string>(NONE_OPTION)
  const [scmIntegrationId, setScmIntegrationId] = useState<string>(NONE_OPTION)

  const [sourceRepository, setSourceRepository] = useState('')
  const [baseBranch, setBaseBranch] = useState('main')
  const [pullRequestRepository, setPullRequestRepository] = useState('')
  const [pullRequestBaseBranch, setPullRequestBaseBranch] = useState('')
  const [branchNameTemplate, setBranchNameTemplate] = useState('')
  const [integrationCredentialId, setIntegrationCredentialId] = useState<string>(NONE_OPTION)
  const [integrationCredentials, setIntegrationCredentials] = useState<IntegrationCredential[]>([])
  const [isLoadingCredentials, setIsLoadingCredentials] = useState(false)
  const [credentialsError, setCredentialsError] = useState<string | null>(null)

  const ticketingIntegrations = useMemo(
    () => allIntegrations.filter((i) => i.category !== 'scm' && i.category !== 'inbound'),
    [allIntegrations]
  )
  const scmIntegrations = useMemo(
    () => allIntegrations.filter((i) => i.category === 'scm'),
    [allIntegrations]
  )

  useEffect(() => {
    let isActive = true
    async function load() {
      setIsLoadingIntegrations(true)
      setIntegrationLoadError(null)
      try {
        const [availableTypes, integrations] = await Promise.all([
          getAvailableIntegrationTypes(),
          getIntegrations(),
        ])
        if (!isActive) return
        const categoryBySystem = new Map(availableTypes.map((t) => [t.id, t.category]))
        setAllIntegrations(
          integrations.map((i) => ({
            id: i.id,
            name: i.name,
            system: i.system,
            category: categoryBySystem.get(i.system) ?? 'ticketing',
          }))
        )
      } catch (err) {
        if (isActive) setIntegrationLoadError(err instanceof Error ? err.message : 'Failed to load integrations')
      } finally {
        if (isActive) setIsLoadingIntegrations(false)
      }
    }
    void load()
    return () => { isActive = false }
  }, [])

  useEffect(() => {
    if (scmIntegrationId === NONE_OPTION) {
      setIntegrationCredentials([])
      setIntegrationCredentialId(NONE_OPTION)
      setCredentialsError(null)
      return
    }
    let isActive = true
    async function load() {
      setIsLoadingCredentials(true)
      setCredentialsError(null)
      try {
        const creds = await getIntegrationCredentials(scmIntegrationId)
        if (isActive) setIntegrationCredentials(creds)
      } catch (err) {
        if (isActive) {
          setIntegrationCredentials([])
          setCredentialsError(err instanceof Error ? err.message : 'Failed to load credentials')
        }
      } finally {
        if (isActive) setIsLoadingCredentials(false)
      }
    }
    void load()
    return () => { isActive = false }
  }, [scmIntegrationId])

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)
    const formData = new FormData(event.currentTarget)
    try {
      // Create the project only if not already created (allows retry after integration failure)
      let projectId = createdProjectId
      let projectSlug = createdProjectSlug
      if (!projectId || !projectSlug) {
        const projectData: CreateProjectRequest = {
          name: formData.get('name') as string,
          autoFixEnabled,
          autoFixTags: ((formData.get('auto_fix_tags') as string) || '')
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
          agentInstructions: ((formData.get('agent_instructions') as string) || '').trim() || undefined,
        }
        const project = await createProject(projectData)
        projectId = project.id
        projectSlug = project.slug
        setCreatedProjectId(projectId)
        setCreatedProjectSlug(projectSlug)
      }

      const selectedTicketing = ticketingIntegrations.find((i) => i.id === ticketingIntegrationId)
      if (selectedTicketing) {
        await linkIntegrationToProject(projectId, selectedTicketing.id)
        await updateProject(projectId, { ticketSystem: selectedTicketing.system })
      }

      if (scmIntegrationId !== NONE_OPTION) {
        const selectedScm = scmIntegrations.find((i) => i.id === scmIntegrationId)
        if (!selectedScm) throw new Error('Select a valid SCM integration')
        if (!sourceRepository.trim()) throw new Error('Source repository is required when an SCM integration is selected')
        await linkIntegrationToProject(projectId, selectedScm.id)
        await upsertProjectScmConfig(projectId, {
          integrationId: selectedScm.id,
          sourceRepository: sourceRepository.trim(),
          baseBranch: normalizeOptionalText(baseBranch) || 'main',
          pullRequestRepository: normalizeOptionalText(pullRequestRepository),
          pullRequestBaseBranch: normalizeOptionalText(pullRequestBaseBranch),
          branchNameTemplate: normalizeOptionalText(branchNameTemplate),
          integrationCredentialId: integrationCredentialId !== NONE_OPTION ? integrationCredentialId : null,
        })
      }

      navigate(`/project/${projectSlug}`)
    } catch (err) {
      setError(getErrorMessage(err, 'An unexpected error occurred'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <PageMeta title="New Project" />
      <div className="mx-auto max-w-4xl">
        <Heading>Create New Project</Heading>

        {error && (
          <div className="mt-4 rounded-md bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {error}
            {createdProjectId && (
              <p className="mt-1">
                The project was created. You can also{' '}
                <Link href={`/project/${createdProjectSlug}/settings/project`} className="font-medium underline">
                  configure integrations in project settings
                </Link>
                .
              </p>
            )}
          </div>
        )}

        <form className="mt-8" onSubmit={handleCreate}>
          <Fieldset>
            <FieldGroup className="space-y-8">
              <Field>
                <Label>Project Name</Label>
                <Description>What should we call this project?</Description>
                <Input name="name" placeholder="e.g. My Awesome App" required disabled={!!createdProjectId} />
              </Field>

              <div className="rounded-xl border border-zinc-950/10 bg-zinc-50/50 p-6 dark:border-white/10 dark:bg-zinc-900/50">
                <div className="mb-4">
                  <Label className="text-base">Ticketing Integration</Label>
                  <Description>Select which integration to use for bug tracking.</Description>
                </div>

                {integrationLoadError ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400">
                    {integrationLoadError}
                  </div>
                ) : isLoadingIntegrations ? (
                  <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-4 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                    Loading integrations...
                  </div>
                ) : (
                  <Field>
                    <Select
                      value={ticketingIntegrationId}
                      onChange={(v) => { if (v !== '') setTicketingIntegrationId(v) }}
                      disabled={ticketingIntegrations.length === 0}
                    >
                      <option value={NONE_OPTION}>
                        {ticketingIntegrations.length === 0
                          ? 'No integrations configured — use Viberglass as ticketing system'
                          : 'Use Viberglass as ticketing system (no external integration)'}
                      </option>
                      {ticketingIntegrations.map((i) => (
                        <option key={i.id} value={i.id}>{i.name} ({i.system})</option>
                      ))}
                    </Select>
                    {ticketingIntegrations.length === 0 && (
                      <Description className="mt-2">
                        You can use Viberglass as your sole ticketing system, or{' '}
                        <Link href="/settings/integrations" className="text-brand-burnt-orange hover:underline">
                          create an integration
                        </Link>{' '}
                        first to sync tickets externally.
                      </Description>
                    )}
                  </Field>
                )}
              </div>

              <div className="rounded-xl border border-zinc-950/10 bg-zinc-50/50 p-6 dark:border-white/10 dark:bg-zinc-900/50">
                <div className="mb-4">
                  <Label className="text-base">SCM Execution</Label>
                  <Description>Configure the repository and branch strategy used by clankers.</Description>
                </div>

                <FieldGroup className="space-y-4">
                  <Field>
                    <Label>SCM Integration</Label>
                    <Select
                      value={scmIntegrationId}
                      onChange={(v) => { if (v !== '') setScmIntegrationId(v) }}
                      disabled={isLoadingIntegrations || scmIntegrations.length === 0}
                    >
                      <option value={NONE_OPTION}>No SCM integration configured</option>
                      {scmIntegrations.map((i) => (
                        <option key={i.id} value={i.id}>{i.name} ({i.system})</option>
                      ))}
                    </Select>
                    {!isLoadingIntegrations && scmIntegrations.length === 0 && (
                      <Description className="mt-2">
                        <Link href="/settings/integrations" className="text-brand-burnt-orange hover:underline">
                          Create a GitHub, GitLab, or Bitbucket integration
                        </Link>{' '}
                        to enable SCM configuration.
                      </Description>
                    )}
                  </Field>

                  <Field>
                    <Label>Source Repository</Label>
                    <Description>Repository cloned by clankers when executing jobs.</Description>
                    <Input
                      placeholder="https://github.com/org/repo"
                      value={sourceRepository}
                      onChange={(e) => setSourceRepository(e.target.value)}
                      disabled={scmIntegrationId === NONE_OPTION}
                    />
                  </Field>

                  <Field>
                    <Label>Base Branch</Label>
                    <Description>Default branch used as merge target and checkout base.</Description>
                    <Input
                      placeholder="main"
                      value={baseBranch}
                      onChange={(e) => setBaseBranch(e.target.value)}
                      disabled={scmIntegrationId === NONE_OPTION}
                    />
                  </Field>

                  <Field>
                    <Label>Pull Request Repository (Optional)</Label>
                    <Description>Override PR destination repository. Leave empty to use source repository.</Description>
                    <Input
                      placeholder="https://github.com/org/repo"
                      value={pullRequestRepository}
                      onChange={(e) => setPullRequestRepository(e.target.value)}
                      disabled={scmIntegrationId === NONE_OPTION}
                    />
                  </Field>

                  <Field>
                    <Label>Pull Request Base Branch (Optional)</Label>
                    <Description>Override PR base branch. Leave empty to use base branch.</Description>
                    <Input
                      placeholder="main"
                      value={pullRequestBaseBranch}
                      onChange={(e) => setPullRequestBaseBranch(e.target.value)}
                      disabled={scmIntegrationId === NONE_OPTION}
                    />
                  </Field>

                  <Field>
                    <Label>Branch Name Template (Optional)</Label>
                    <Description>
                      Template for fix branch names. Placeholders: <code>{'{{ ticket }}'}</code>, <code>{'{{ original_ticket }}'}</code>, <code>{'{{ clanker }}'}</code>.
                    </Description>
                    <Input
                      placeholder="viberator/{{ ticket }}"
                      value={branchNameTemplate}
                      onChange={(e) => setBranchNameTemplate(e.target.value)}
                      disabled={scmIntegrationId === NONE_OPTION}
                    />
                  </Field>

                  <Field>
                    <Label>Integration Credential (Recommended)</Label>
                    <Description>
                      Select a credential for SCM authentication. Managed in{' '}
                      <Link
                        href={scmIntegrationId !== NONE_OPTION ? `/settings/integrations/${scmIntegrationId}` : '/settings/integrations'}
                        className="text-brand-burnt-orange hover:underline"
                      >
                        integration settings
                      </Link>.
                    </Description>
                    <Select
                      value={integrationCredentialId}
                      onChange={(v) => { if (v !== '') setIntegrationCredentialId(v) }}
                      disabled={scmIntegrationId === NONE_OPTION || isLoadingCredentials}
                    >
                      <option value={NONE_OPTION}>
                        {isLoadingCredentials ? 'Loading credentials...' : 'Select a credential'}
                      </option>
                      {integrationCredentials.map((cred) => (
                        <option key={cred.id} value={cred.id}>
                          {cred.name}{cred.isDefault ? ' (default)' : ''}
                        </option>
                      ))}
                    </Select>
                    {credentialsError && (
                      <Description className="mt-2 text-red-600 dark:text-red-400">{credentialsError}</Description>
                    )}
                    {!isLoadingCredentials && integrationCredentials.length === 0 && scmIntegrationId !== NONE_OPTION && !credentialsError && (
                      <Description className="mt-2">
                        No credentials configured. Create one in{' '}
                        <Link href={`/settings/integrations/${scmIntegrationId}`} className="text-brand-burnt-orange hover:underline">
                          integration settings
                        </Link>.
                      </Description>
                    )}
                  </Field>
                </FieldGroup>
              </div>

              <div className="rounded-xl border border-zinc-950/10 bg-zinc-50/50 p-6 dark:border-white/10 dark:bg-zinc-900/50">
                <SwitchField>
                  <Label className="text-base">Enable Auto-fix</Label>
                  <Description>Allow AI to automatically suggest and create PRs for bug reports.</Description>
                  <Switch name="auto_fix_enabled" checked={autoFixEnabled} onChange={setAutoFixEnabled} />
                </SwitchField>
                {autoFixEnabled && (
                  <Field className="mt-4">
                    <Label>Auto-fix Tags</Label>
                    <Description>Comma-separated tags to trigger automatic fixes (e.g. &quot;bug, high-priority&quot;).</Description>
                    <Input name="auto_fix_tags" placeholder="bug, fix-requested" />
                  </Field>
                )}
              </div>

              <Field>
                <Label>Additional Agent Instructions</Label>
                <Description>Provide any extra guidance the AI agent should follow when working on this project.</Description>
                <Textarea name="agent_instructions" rows={4} placeholder="e.g. Prioritize safety fixes, avoid large refactors..." />
              </Field>

              <div className="flex justify-end gap-4 border-t border-zinc-950/10 pt-8 dark:border-white/10">
                <Button outline href="/">Cancel</Button>
                <Button type="submit" color="brand" disabled={isSubmitting}>
                  {isSubmitting ? 'Creating...' : createdProjectId ? 'Finish Setup' : 'Create Project'}
                </Button>
              </div>
            </FieldGroup>
          </Fieldset>
        </form>
      </div>
    </>
  )
}
