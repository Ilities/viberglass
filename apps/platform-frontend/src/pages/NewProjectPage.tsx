import { Button } from '@/components/button'
import { Field, FieldGroup, Fieldset, Label } from '@/components/fieldset'
import { Heading, Subheading } from '@/components/heading'
import { Input } from '@/components/input'
import { Link } from '@/components/link'
import { PageMeta } from '@/components/page-meta'
import { SpaceBackingField } from '@/components/space-backing-field'
import type { SpaceBackingKind } from '@viberglass/types'
import { useAppSpacesAvailable } from '@/hooks/useAppSpacesAvailable'
import { useNewRepository } from '@/hooks/useNewRepository'
import { getErrorMessage } from '@/lib/project-form'
import { repositoryNameFrom } from '@/lib/repositoryAddress'
import { IssueTrackerField } from '@/pages/project/settings/IssueTrackerField'
import {
  NO_SELECTION,
  RepositoryFields,
  isCreatingRepository,
  type ConnectionOption,
} from '@/pages/project/settings/RepositoryFields'
import { SpaceAdvancedSettings } from '@/pages/project/settings/SpaceAdvancedSettings'
import { useWorkspaceConnections } from '@/pages/project/settings/useWorkspaceConnections'
import { linkIntegrationToProject } from '@/service/api/integration-api'
import { createProject, updateProject, upsertProjectScmConfig } from '@/service/api/project-api'
import { createSpaceRepository, getRepositoryOwners } from '@/service/api/repository-api'
import { useRef, useState } from 'react'
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
  const [backingKind, setBackingKind] = useState<SpaceBackingKind>('git')
  const appSpacesAvailable = useAppSpacesAvailable()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Kept so a failed repository step can be retried without creating the space twice.
  const [created, setCreated] = useState<{ id: string; slug: string } | null>(null)
  const linkedIntegrationIds = useRef(new Set<string>())

  const [trackerId, setTrackerId] = useState<string>(NO_SELECTION)
  const [codeHostId, setCodeHostId] = useState<string>(NO_SELECTION)
  const [repositoryAddress, setRepositoryAddress] = useState('')
  const [defaultBranch, setDefaultBranch] = useState('main')
  const [pullRequestRepository, setPullRequestRepository] = useState('')
  const [pullRequestBaseBranch, setPullRequestBaseBranch] = useState('')
  const [branchNameTemplate, setBranchNameTemplate] = useState('')
  const [tokenId, setTokenId] = useState<string>(NO_SELECTION)

  const connections = useWorkspaceConnections(codeHostId)
  const chosenTokenId = tokenId !== NO_SELECTION ? tokenId : null
  const newRepository = useNewRepository(
    codeHostId !== NO_SELECTION ? `${codeHostId}:${tokenId}` : null,
    () => getRepositoryOwners(codeHostId, chosenTokenId),
    repositoryNameFrom(name)
  )

  function changeCodeHost(id: string) {
    setCodeHostId(id)
    setTokenId(NO_SELECTION)
  }

  async function linkOnce(spaceId: string, integrationId: string) {
    if (linkedIntegrationIds.current.has(integrationId)) return
    await linkIntegrationToProject(spaceId, integrationId, true)
    linkedIntegrationIds.current.add(integrationId)
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)
    try {
      let space = created
      if (!space) {
        const project = await createProject({ name: name.trim(), backingKind })
        space = { id: project.id, slug: project.slug }
        setCreated(space)
      }

      const tracker = findOption(connections.trackers, trackerId)
      if (tracker) {
        await linkOnce(space.id, tracker.id)
        await updateProject(space.id, { primaryTicketingIntegrationId: tracker.id })
      }

      if (backingKind === 'git' && codeHostId !== NO_SELECTION) {
        const codeHost = findOption(connections.codeHosts, codeHostId)
        if (!codeHost) throw new Error('Choose a code host, or choose None.')
        const creating = isCreatingRepository(connections.codeHosts, codeHostId, newRepository)
        if (creating && !newRepository.isReady) throw new Error('Choose an owner and a name for the new repository.')
        if (!creating && !repositoryAddress.trim())
          throw new Error('Enter the repository address, e.g. https://github.com/acme/storefront, or choose None.')
        await linkOnce(space.id, codeHost.id)
        let address = repositoryAddress.trim()
        let branch = normalizeOptionalText(defaultBranch) || 'main'
        if (creating) {
          const repository = await createSpaceRepository(space.id, {
            integrationId: codeHost.id,
            integrationCredentialId: chosenTokenId,
            owner: newRepository.owner,
            name: newRepository.name.trim(),
          })
          // From here on it's an existing repository, so a retry after a failed save doesn't create it again.
          address = repository.url
          branch = repository.defaultBranch
          setRepositoryAddress(address)
          setDefaultBranch(branch)
          newRepository.setSource('existing')
        }
        await upsertProjectScmConfig(space.id, {
          integrationId: codeHost.id,
          sourceRepository: address,
          baseBranch: branch,
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
            {created && backingKind === 'git' && (
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

              <SpaceBackingField
                value={backingKind}
                onChange={setBackingKind}
                disabled={created !== null}
                offerApp={appSpacesAvailable}
              />

              {backingKind === 'git' && <section>
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
                    newRepository={newRepository}
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
                    taskKeyExample="WEB-12"
                  />
                </div>
              </section>}

              <IssueTrackerField
                trackers={connections.trackers}
                value={trackerId}
                onChange={setTrackerId}
                isLoading={connections.isLoading}
                connectionsHref={WORKSPACE_CONNECTIONS}
              />

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
