import { Button } from '@/components/button'
import { Description, Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { NewRepositoryFields, RepositorySourceField } from '@/components/new-repository-fields'
import { SpaceBackingField } from '@/components/space-backing-field'
import { useDebounce } from '@/hooks/useDebounce'
import { useNewRepository } from '@/hooks/useNewRepository'
import { gitHubTokenUrl } from '@/lib/repositoryAddress'
import { createSetupRepository, listSetupRepositoryOwners, saveRepository } from '@/service/api/setup-api'
import type { RepositoryAccess, SpaceBackingKind } from '@viberglass/types'
import { useState } from 'react'
import { ExternalLink, SetupError, SetupFrame } from './SetupFrame'

function looksLikeToken(token: string): boolean {
  return token.length > 0 && !/\s/.test(token)
}

export function RepositoryStep({
  createsRepositories,
  onDone,
  onChooseFiles,
}: {
  createsRepositories: boolean
  onDone: (repository: RepositoryAccess) => void
  onChooseFiles: () => void
}) {
  const [backingKind, setBackingKind] = useState<SpaceBackingKind>('git')
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
    if (backingKind === 'files') {
      onChooseFiles()
      return
    }
    setError(null)
    setIsChecking(true)
    try {
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
  const submitLabel = creating
    ? isChecking
      ? 'Creating the repository…'
      : 'Create repository'
    : isChecking
      ? 'Checking with GitHub…'
      : 'Continue'
  const incomplete = creating ? !newRepository.isReady || !token.trim() : !repository.trim() || !token.trim()

  return (
    <SetupFrame
      step={2}
      title="Choose your space backing"
      intro="Use a repository for code, or Files for documents, presentations and other artifacts."
    >
      <form onSubmit={handleSubmit} className="grid gap-6">
        <SetupError message={error} />
        <SpaceBackingField value={backingKind} onChange={setBackingKind} />
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
          <Button type="submit" color="brand" disabled={isChecking || (backingKind === 'git' && incomplete)}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </SetupFrame>
  )
}
