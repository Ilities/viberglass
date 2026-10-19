import { Button } from '@/components/button'
import { Description, Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { SpaceBackingField } from '@/components/space-backing-field'
import { gitHubTokenUrl } from '@/lib/repositoryAddress'
import { saveRepository } from '@/service/api/setup-api'
import type { RepositoryAccess, SpaceBackingKind } from '@viberglass/types'
import { useState } from 'react'
import { ExternalLink, SetupError, SetupFrame } from './SetupFrame'

export function RepositoryStep({ onDone, onChooseFiles }: { onDone: (repository: RepositoryAccess) => void; onChooseFiles: () => void }) {
  const [backingKind, setBackingKind] = useState<SpaceBackingKind>('git')
  const [repository, setRepository] = useState('')
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isChecking, setIsChecking] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (backingKind === 'files') {
      onChooseFiles()
      return
    }
    setError(null)
    setIsChecking(true)
    try {
      onDone(await saveRepository(repository, token))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't check the repository.")
    } finally {
      setIsChecking(false)
    }
  }

  return (
    <SetupFrame
      step={2}
      title="Choose your space backing"
      intro="Use a repository for code, or Files for documents, presentations and other artifacts."
    >
      <form onSubmit={handleSubmit} className="grid gap-6">
        <SetupError message={error} />
        <SpaceBackingField value={backingKind} onChange={setBackingKind} />
        {backingKind === 'git' && <><Field>
          <Label>Repository</Label>
          <Input
            name="repository"
            value={repository}
            onChange={(event) => setRepository(event.target.value)}
            placeholder="acme/web or https://github.com/acme/web"
            spellCheck={false}
          />
        </Field>
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
            <ExternalLink href={gitHubTokenUrl(repository)}>Create a token with the right permissions</ExternalLink>,
            then choose this repository under Repository access.
          </Description>
        </Field></>}
        <div>
          <Button type="submit" color="brand" disabled={isChecking || (backingKind === 'git' && (!repository.trim() || !token.trim()))}>
            {isChecking ? 'Checking with GitHub…' : 'Continue'}
          </Button>
        </div>
      </form>
    </SetupFrame>
  )
}
