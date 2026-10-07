import { Button } from '@/components/button'
import { Field, FieldGroup, Fieldset, Label } from '@/components/fieldset'
import { Heading, Subheading } from '@/components/heading'
import { Input } from '@/components/input'
import { Link } from '@/components/link'
import { PageMeta } from '@/components/page-meta'
import { getErrorMessage } from '@/lib/project-form'
import { IssueTrackerField } from '@/pages/project/settings/IssueTrackerField'
import { NO_SELECTION, RepositoryFields, type ConnectionOption } from '@/pages/project/settings/RepositoryFields'
import { SpaceAdvancedSettings } from '@/pages/project/settings/SpaceAdvancedSettings'
import { useWorkspaceConnections } from '@/pages/project/settings/useWorkspaceConnections'
import { linkIntegrationToProject } from '@/service/api/integration-api'
import { createProject, updateProject, upsertProjectScmConfig } from '@/service/api/project-api'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const WORKSPACE_CONNECTIONS = '/settings/connections'

function normalizeOptionalText(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function findOption(options: ConnectionOption[], id: string): ConnectionOption | undefined {
  return options.find((option) => option.id === id)
}

export function NewProjectPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Kept so a failed repository step can be retried without creating the space twice.
  const [created, setCreated] = useState<{ id: string; slug: string } | null>(null)

  const [trackerId, setTrackerId] = useState<string>(NO_SELECTION)
  const [codeHostId, setCodeHostId] = useState<string>(NO_SELECTION)
  const [repositoryAddress, setRepositoryAddress] = useState('')
  const [defaultBranch, setDefaultBranch] = useState('main')
  const [pullRequestRepository, setPullRequestRepository] = useState('')
  const [pullRequestBaseBranch, setPullRequestBaseBranch] = useState('')
  const [branchNameTemplate, setBranchNameTemplate] = useState('')
  const [tokenId, setTokenId] = useState<string>(NO_SELECTION)
  const [autoFixEnabled, setAutoFixEnabled] = useState(false)
  const [autoFixTags, setAutoFixTags] = useState('')

  const connections = useWorkspaceConnections(codeHostId)

  function changeCodeHost(id: string) {
    setCodeHostId(id)
    setTokenId(NO_SELECTION)
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)
    try {
      let space = created
      if (!space) {
        const project = await createProject({
          name: name.trim(),
          autoFixEnabled,
          autoFixTags: autoFixTags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
        })
        space = { id: project.id, slug: project.slug }
        setCreated(space)
      }

      const tracker = findOption(connections.trackers, trackerId)
      if (tracker) {
        await linkIntegrationToProject(space.id, tracker.id, true)
        await updateProject(space.id, { primaryTicketingIntegrationId: tracker.id })
      }

      if (codeHostId !== NO_SELECTION) {
        const codeHost = findOption(connections.codeHosts, codeHostId)
        if (!codeHost) throw new Error('Choose a code host, or choose None.')
        if (!repositoryAddress.trim())
          throw new Error('Enter the repository address, e.g. https://github.com/acme/storefront, or choose None.')
        await linkIntegrationToProject(space.id, codeHost.id, true)
        await upsertProjectScmConfig(space.id, {
          integrationId: codeHost.id,
          sourceRepository: repositoryAddress.trim(),
          baseBranch: normalizeOptionalText(defaultBranch) || 'main',
          pullRequestRepository: normalizeOptionalText(pullRequestRepository),
          pullRequestBaseBranch: normalizeOptionalText(pullRequestBaseBranch),
          branchNameTemplate: normalizeOptionalText(branchNameTemplate),
          integrationCredentialId: tokenId !== NO_SELECTION ? tokenId : null,
        })
      }

      navigate(`/spaces/${space.slug}`)
    } catch (err) {
      setError(getErrorMessage(err, 'An unexpected error occurred'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <PageMeta title="New space" />
      <div className="mx-auto max-w-4xl">
        <Heading>Create space</Heading>

        {(error || connections.loadError) && (
          <div className="mt-4 rounded-md bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {error ?? connections.loadError}
            {created && (
              <p className="mt-1">
                The space was created. You can also{' '}
                <Link href={`/spaces/${created.slug}/settings/repository`} className="font-medium underline">
                  finish setting up its repository
                </Link>
                .
              </p>
            )}
          </div>
        )}

        <form className="mt-8" onSubmit={(event) => void handleCreate(event)}>
          <Fieldset disabled={isSubmitting}>
            <FieldGroup className="space-y-8">
              <Field>
                <Label>Name</Label>
                <Input
                  name="name"
                  placeholder="e.g. Web shop"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  disabled={created !== null}
                />
              </Field>

              <section>
                <Subheading>Repository</Subheading>
                <div className="mt-6 space-y-8">
                  <RepositoryFields
                    codeHosts={connections.codeHosts}
                    codeHostId={codeHostId}
                    onCodeHostChange={changeCodeHost}
                    isLoadingCodeHosts={connections.isLoading}
                    connectionsHref={WORKSPACE_CONNECTIONS}
                    repositoryAddress={repositoryAddress}
                    onRepositoryAddressChange={setRepositoryAddress}
                    defaultBranch={defaultBranch}
                    onDefaultBranchChange={setDefaultBranch}
                    tokens={connections.tokens}
                    tokenId={tokenId}
                    onTokenChange={setTokenId}
                    isLoadingTokens={connections.isLoadingTokens}
                    tokensError={connections.tokensError}
                  />

                  <IssueTrackerField
                    trackers={connections.trackers}
                    value={trackerId}
                    onChange={setTrackerId}
                    isLoading={connections.isLoading}
                    connectionsHref={WORKSPACE_CONNECTIONS}
                  />

                  <SpaceAdvancedSettings
                    hasRepository={codeHostId !== NO_SELECTION}
                    defaultBranch={defaultBranch}
                    pullRequestRepository={pullRequestRepository}
                    onPullRequestRepositoryChange={setPullRequestRepository}
                    pullRequestBaseBranch={pullRequestBaseBranch}
                    onPullRequestBaseBranchChange={setPullRequestBaseBranch}
                    branchNameTemplate={branchNameTemplate}
                    onBranchNameTemplateChange={setBranchNameTemplate}
                    autoFixEnabled={autoFixEnabled}
                    onAutoFixEnabledChange={setAutoFixEnabled}
                    autoFixTags={autoFixTags}
                    onAutoFixTagsChange={setAutoFixTags}
                    taskKeyExample="WEB-12"
                  />
                </div>
              </section>

              <div className="flex justify-end gap-4 border-t border-zinc-950/10 pt-8 dark:border-white/10">
                <Button outline href="/">
                  Cancel
                </Button>
                <Button type="submit" color="brand" disabled={isSubmitting}>
                  {isSubmitting ? 'Creating…' : created ? 'Finish setup' : 'Create space'}
                </Button>
              </div>
            </FieldGroup>
          </Fieldset>
        </form>
      </div>
    </>
  )
}
