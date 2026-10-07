import { Description, Field, FieldGroup, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Link } from '@/components/link'
import { Select } from '@/components/select'
import type { IntegrationCredential } from '@viberglass/types'

/** A select's "nothing chosen" value: Radix selects can't hold an empty one. */
export const NO_SELECTION = '__none__'

export interface ConnectionOption {
  id: string
  label: string
}

/** A connection's name, followed by its provider when the name doesn't already say it. */
export function connectionOptionLabel(name: string, providerLabel: string): string {
  return name.toLowerCase().includes(providerLabel.toLowerCase()) ? name : `${name} (${providerLabel})`
}

interface RepositoryFieldsProps {
  codeHosts: ConnectionOption[]
  codeHostId: string
  onCodeHostChange: (id: string) => void
  isLoadingCodeHosts: boolean
  /** Where a missing code host gets linked or created. */
  connectionsHref: string
  repositoryAddress: string
  onRepositoryAddressChange: (value: string) => void
  defaultBranch: string
  onDefaultBranchChange: (value: string) => void
  tokens: IntegrationCredential[]
  tokenId: string
  onTokenChange: (id: string) => void
  isLoadingTokens: boolean
  tokensError: string | null
}

/** Ignores the empty value Radix emits while its options reconcile. */
function ignoringEmpty(onChange: (value: string) => void) {
  return (value: string) => {
    if (value !== '') onChange(value)
  }
}

/** The code a space's agents work on: code host, repository, branch and the token they push with. */
export function RepositoryFields(props: RepositoryFieldsProps) {
  const hasCodeHost = props.codeHostId !== NO_SELECTION
  const noCodeHosts = !props.isLoadingCodeHosts && props.codeHosts.length === 0

  return (
    <FieldGroup className="space-y-4">
      <Field>
        <Label>Code host</Label>
        <Select
          name="scm_integration"
          value={props.codeHostId}
          onChange={ignoringEmpty(props.onCodeHostChange)}
          disabled={props.isLoadingCodeHosts || props.codeHosts.length === 0}
        >
          <option value={NO_SELECTION}>{props.isLoadingCodeHosts ? 'Loading…' : 'None'}</option>
          {props.codeHosts.map((codeHost) => (
            <option key={codeHost.id} value={codeHost.id}>
              {codeHost.label}
            </option>
          ))}
        </Select>
        {noCodeHosts ? (
          <Description className="mt-2">
            <Link href={props.connectionsHref} className="text-[var(--accent-11)] underline underline-offset-2">
              Link GitHub, GitLab or Bitbucket
            </Link>{' '}
            to work on code.
          </Description>
        ) : null}
      </Field>

      <Field>
        <Label>Repository address</Label>
        <Input
          name="source_repository"
          placeholder="https://github.com/acme/storefront"
          value={props.repositoryAddress}
          onChange={(event) => props.onRepositoryAddressChange(event.target.value)}
          disabled={!hasCodeHost}
        />
      </Field>

      <Field>
        <Label>Default branch</Label>
        <Input
          name="base_branch"
          placeholder="main"
          value={props.defaultBranch}
          onChange={(event) => props.onDefaultBranchChange(event.target.value)}
          disabled={!hasCodeHost}
        />
      </Field>

      <Field>
        <Label>Access token</Label>
        <Description>Needs to read the repository and open pull requests.</Description>
        <Select
          name="integration_credential_id"
          value={props.tokenId}
          onChange={ignoringEmpty(props.onTokenChange)}
          disabled={!hasCodeHost || props.isLoadingTokens}
        >
          <option value={NO_SELECTION}>{props.isLoadingTokens ? 'Loading tokens…' : 'Choose a token'}</option>
          {props.tokens.map((token) => (
            <option key={token.id} value={token.id}>
              {token.name}
              {token.isDefault ? ' (default)' : ''}
            </option>
          ))}
        </Select>
        {props.tokensError ? (
          <Description className="mt-2 text-red-600 dark:text-red-400">{props.tokensError}</Description>
        ) : null}
        {hasCodeHost && !props.isLoadingTokens && !props.tokensError && props.tokens.length === 0 ? (
          <Description className="mt-2">
            No tokens yet.{' '}
            <Link
              href={`/settings/connections/${props.codeHostId}`}
              className="text-[var(--accent-11)] underline underline-offset-2"
            >
              Add one to the connection
            </Link>
            .
          </Description>
        ) : null}
      </Field>
    </FieldGroup>
  )
}
