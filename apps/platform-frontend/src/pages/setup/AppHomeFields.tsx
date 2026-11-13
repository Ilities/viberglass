import { Description, ErrorMessage, Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { useDebounce } from '@/hooks/useDebounce'
import { gitHubTokenUrl } from '@/lib/repositoryAddress'
import { listSetupRepositoryOwners } from '@/service/api/setup-api'
import type { RepositoryOwner } from '@viberglass/types'
import { useEffect, useState } from 'react'
import { ExternalLink } from './SetupFrame'

/** The token App spaces' repositories are created with, and the account they belong to, picked from where the token can create them. */
export function AppHomeFields({
  token,
  onTokenChange,
  owner,
  onOwnerChange,
  disabled,
}: {
  token: string
  onTokenChange: (token: string) => void
  owner: string
  onOwnerChange: (owner: string) => void
  disabled?: boolean
}) {
  const settledToken = useDebounce(token.trim(), 500)
  const [owners, setOwners] = useState<RepositoryOwner[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setOwners([])
    setError(null)
    if (!settledToken || /\s/.test(settledToken)) return
    let isActive = true
    setIsLoading(true)
    listSetupRepositoryOwners(settledToken)
      .then((loaded) => {
        if (!isActive) return
        setOwners(loaded)
        if (loaded.length === 0) setError("This token can't create repositories anywhere. Create one with the link above.")
      })
      .catch((err: unknown) => isActive && setError(err instanceof Error ? err.message : "Couldn't check the token."))
      .finally(() => isActive && setIsLoading(false))
    return () => {
      isActive = false
    }
  }, [settledToken])

  useEffect(() => {
    if (owners.length > 0 && !owners.some((candidate) => candidate.name === owner)) onOwnerChange(owners[0].name)
  }, [owners, owner, onOwnerChange])

  return (
    <>
      <Field>
        <Label>GitHub access token</Label>
        <Input
          type="password"
          name="token"
          autoComplete="off"
          spellCheck={false}
          value={token}
          onChange={(event) => onTokenChange(event.target.value)}
          disabled={disabled}
        />
        <Description>
          Each app's code is kept in a private GitHub repository that Viberglass creates.{' '}
          <ExternalLink href={gitHubTokenUrl('', { createsRepositories: true })}>
            Create a token that can make repositories
          </ExternalLink>
          , with access to All repositories.
        </Description>
      </Field>
      <Field>
        <Label>Owner</Label>
        <Select
          name="owner"
          value={owner}
          onChange={(next) => next && onOwnerChange(next)}
          disabled={disabled || owners.length === 0}
          placeholder={isLoading ? 'Loading…' : 'Paste the token first'}
        >
          {owners.map((candidate) => (
            <option key={candidate.name} value={candidate.name}>
              {candidate.name}
              {candidate.kind === 'user' ? ' (you)' : ''}
            </option>
          ))}
        </Select>
        {error ? (
          <ErrorMessage>{error}</ErrorMessage>
        ) : (
          <Description>The account or organisation the apps' repositories belong to.</Description>
        )}
      </Field>
    </>
  )
}
