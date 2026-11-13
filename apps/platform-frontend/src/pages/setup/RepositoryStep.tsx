import { Button } from '@/components/button'
import { Description, Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { NewRepositoryFields, RepositorySourceField } from '@/components/new-repository-fields'
import { SpaceBackingField } from '@/components/space-backing-field'
import { useDebounce } from '@/hooks/useDebounce'
import { useNewRepository } from '@/hooks/useNewRepository'
import { gitHubTokenUrl } from '@/lib/repositoryAddress'
import { createSetupRepository, listSetupRepositoryOwners, saveRepository, saveSetupAppHome } from '@/service/api/setup-api'
import type { RepositoryAccess, SetupStatus, SpaceBackingKind } from '@viberglass/types'
import { AppHomeFields } from './AppHomeFields'
import { useState } from 'react'
import { ExternalLink, SetupError, SetupFrame } from './SetupFrame'

function looksLikeToken(token: string): boolean {
  return token.length > 0 && !/\s/.test(token)
}

export function RepositoryStep({
  createsRepositories,
  appSpaces,
  onAppHomeSaved,
  onDone,
  onChooseWithoutRepository,
}: {
  createsRepositories: boolean
  appSpaces: SetupStatus['appSpaces']
  onAppHomeSaved: () => void
  onDone: (repository: RepositoryAccess) => void
  /** Files and App spaces need no repository from this step. */
  onChooseWithoutRepository: (backingKind: Exclude<SpaceBackingKind, 'git'>) => void
}) {
  const offerApp = appSpaces !== 'unavailable'
  const [backingKind, setBackingKind] = useState<SpaceBackingKind>(offerApp ? 'app' : 'git')
  const [appOwner, setAppOwner] = useState('')
  const settingUpApps = backingKind === 'app' && appSpaces === 'needs_home'
  const [repository, setRepository] = useState('')
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const settledToken = useDebounce(token.trim(), 500)
  const newRepository = useNewRepository(looksLikeToken(settledToken) ? settledToken : null, () =>
    listSetupRepositoryOwners(settledToken)
  )
  const creating = createsRepositories && newRepository.source === 'new'

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (backingKind !== 'git' && !settingUpApps) {
      onChooseWithoutRepository(backingKind)
      return
    }
    setError(null)
    setIsChecking(true)
    try {
      if (settingUpApps) {
        await saveSetupAppHome(appOwner, token)
        onAppHomeSaved()
        onChooseWithoutRepository('app')
        return
      }
      onDone(
        creating
          ? await createSetupRepository({ owner: newRepository.owner, name: newRepository.name.trim() }, token)
          : await saveRepository(repository, token)
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't check the repository.")
    } finally {
      setIsChecking(false)
    }
  }

  const tokenField = (
    <Field>
      <Label>Access token</Label>
      <Input
        type="password"
        name="token"
        autoComplete="off"
        spellCheck={false}
        value={token}
        onChange={(event) => setToken(event.target.value)}
      />
      <Description>
        {creating ? (
          <>
            <ExternalLink href={gitHubTokenUrl('', { createsRepositories: true })}>
              Create a token that can make repositories
            </ExternalLink>
            , with access to All repositories so it can work in the new one.
          </>
        ) : (
          <>
            <ExternalLink href={gitHubTokenUrl(repository)}>Create a token with the right permissions</ExternalLink>,
            then choose this repository under Repository access.
          </>
        )}
      </Description>
    </Field>
  )
  const submitLabel = settingUpApps
    ? isChecking
      ? 'Checking with GitHub…'
      : 'Continue'
    : creating
    ? isChecking
      ? 'Creating the repository…'
      : 'Create repository'
    : isChecking
      ? 'Checking with GitHub…'
      : 'Continue'
  const incomplete = settingUpApps
    ? !appOwner || !token.trim()
    : backingKind === 'git' && (creating ? !newRepository.isReady || !token.trim() : !repository.trim() || !token.trim())

  return (
    <SetupFrame
      step={2}
      title="Choose your space backing"
      intro={
        offerApp
          ? 'Choose App for a tool your team uses, a repository for code, or Files for documents, presentations and other artifacts.'
          : 'Use a repository for code, or Files for documents, presentations and other artifacts.'
      }
    >
      <form onSubmit={handleSubmit} className="grid gap-6">
        <SetupError message={error} />
        <SpaceBackingField value={backingKind} onChange={setBackingKind} offerApp={offerApp} />
        {settingUpApps && (
          <AppHomeFields
            token={token}
            onTokenChange={setToken}
            owner={appOwner}
            onOwnerChange={setAppOwner}
            disabled={isChecking}
          />
        )}
        {backingKind === 'git' && createsRepositories && (
          <RepositorySourceField
            value={newRepository.source}
            onChange={newRepository.setSource}
            disabled={isChecking}
          />
        )}
        {backingKind === 'git' && creating && (
          <>
            {tokenField}
            <NewRepositoryFields
              form={newRepository}
              disabled={isChecking}
              waitingFor={
                looksLikeToken(settledToken) ? null : 'Paste the token above to choose where the repository goes.'
              }
            />
          </>
        )}
        {backingKind === 'git' && !creating && (
          <>
            <Field>
              <Label>Repository</Label>
              <Input
                name="repository"
                value={repository}
                onChange={(event) => setRepository(event.target.value)}
                placeholder="acme/web or https://github.com/acme/web"
                spellCheck={false}
              />
            </Field>
            {tokenField}
          </>
        )}
        <div>
          <Button type="submit" color="brand" disabled={isChecking || incomplete}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </SetupFrame>
  )
}
