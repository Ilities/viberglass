import { Description, ErrorMessage, Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Radio, RadioField, RadioGroup } from '@/components/radio'
import { Select } from '@/components/select'
import type { NewRepositoryForm, RepositorySource } from '@/hooks/useNewRepository'

const NO_OWNER = '__no_owner__'

export function RepositorySourceField({
  value,
  onChange,
  disabled,
  hideLabel,
}: {
  value: RepositorySource
  onChange: (source: RepositorySource) => void
  disabled?: boolean
  /** For a form whose section heading already says "Repository". */
  hideLabel?: boolean
}) {
  return (
    <Field>
      <Label id="repository-source" className={hideLabel ? 'sr-only' : undefined}>
        Repository
      </Label>
      <RadioGroup
        aria-labelledby="repository-source"
        value={value}
        disabled={disabled}
        onChange={(next) => {
          if (next === 'existing' || next === 'new') onChange(next)
        }}
      >
        <RadioField>
          <Radio value="existing" />
          <Label>Use an existing repository</Label>
          <Description>Agents work in a repository you already have.</Description>
        </RadioField>
        <RadioField>
          <Radio value="new" />
          <Label>Create a new repository</Label>
          <Description>
            For something new. Viberglass creates it for you, so there's nothing to set up first.
          </Description>
        </RadioField>
      </RadioGroup>
    </Field>
  )
}

/** Owner and name side by side, read as the owner/name the repository gets. */
export function NewRepositoryFields({
  form,
  disabled,
  waitingFor,
}: {
  form: NewRepositoryForm
  disabled?: boolean
  /** Why owners can't load yet, e.g. no token entered; shown in place of the owner list. */
  waitingFor?: string | null
}) {
  const ownerPlaceholder = form.isLoadingOwners ? 'Loading…' : waitingFor ? 'Waiting for a token' : 'No owners'
  const preview = form.owner && form.name.trim() ? `${form.owner}/${form.name.trim()}` : null

  return (
    <div>
      <div className="grid grid-cols-[minmax(0,13rem)_auto_minmax(0,1fr)] items-end gap-x-2 max-sm:grid-cols-1 max-sm:gap-y-4">
        <Field>
          <Label>Owner</Label>
          <Select
            name="repository_owner"
            value={form.owner || NO_OWNER}
            onChange={(next) => {
              if (next && next !== NO_OWNER) form.setOwner(next)
            }}
            disabled={disabled || form.owners.length === 0}
          >
            {form.owners.length === 0 && <option value={NO_OWNER}>{ownerPlaceholder}</option>}
            {form.owners.map((owner) => (
              <option key={owner.name} value={owner.name}>
                {owner.name}
                {owner.kind === 'user' ? ' (you)' : ''}
              </option>
            ))}
          </Select>
        </Field>
        <span aria-hidden className="pb-1.5 text-lg text-[var(--gray-9)] max-sm:hidden">
          /
        </span>
        <Field>
          <Label>Repository name</Label>
          <Input
            name="repository_name"
            value={form.name}
            onChange={(event) => form.setName(event.target.value)}
            placeholder="laptop-tracker"
            spellCheck={false}
            autoComplete="off"
            disabled={disabled}
          />
        </Field>
      </div>
      <Field>
        {form.ownersError ? (
          <ErrorMessage className="mt-3">{form.ownersError}</ErrorMessage>
        ) : (
          <Description className="mt-3">
            {waitingFor && form.owners.length === 0
              ? waitingFor
              : `${preview ?? 'The repository'} will be private and start with a README, so agents have a branch to build on.`}
          </Description>
        )}
      </Field>
    </div>
  )
}
