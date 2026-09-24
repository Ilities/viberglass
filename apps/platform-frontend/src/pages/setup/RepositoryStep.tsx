import { Button } from '@/components/button'
import { Description, Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { saveRepository } from '@/service/api/setup-api'
import type { RepositoryAccess } from '@viberglass/types'
import { useState } from 'react'
import { ExternalLink, SetupError, SetupFrame } from './SetupFrame'

/** GitHub's new fine-grained token form, prefilled with what the agent needs (push a branch, open a PR). */
export function gitHubTokenUrl(repository: string): string {
  const params = new URLSearchParams({
    name: 'Viberglass',
    description: 'Lets Viberglass agents push branches and open pull requests',
    contents: 'write',
    pull_requests: 'write',
  })
  const owner = /^(?:https?:\/\/)?(?:www\.)?(?:git@)?(?:github\.com[/:])?([A-Za-z0-9_.-]+)\/[A-Za-z0-9_.-]+/.exec(repository.trim())?.[1]
  if (owner) params.set('target_name', owner)
  return `https://github.com/settings/personal-access-tokens/new?${params.toString()}`
}

export function RepositoryStep({ onDone }: { onDone: (repository: RepositoryAccess) => void }) {
  const [repository, setRepository] = useState('')
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isChecking, setIsChecking] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
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
      title="Point at your repository"
      intro="Agents work in a GitHub repository: they read it, push a branch and open a pull request for review."
    >
      <form onSubmit={handleSubmit} className="grid gap-6">
        <SetupError message={error} />
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
        </Field>
        <Button type="submit" className="w-full" disabled={isChecking || !repository.trim() || !token.trim()}>
          {isChecking ? 'Checking with GitHub…' : 'Continue'}
        </Button>
      </form>
    </SetupFrame>
  )
}
