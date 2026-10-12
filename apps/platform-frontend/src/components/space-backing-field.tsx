import { Description, Field, Label } from '@/components/fieldset'
import { Select } from '@/components/select'
import type { SpaceBackingKind } from '@viberglass/types'

export function SpaceBackingField({ value, onChange, disabled }: {
  value: SpaceBackingKind
  onChange: (value: SpaceBackingKind) => void
  disabled?: boolean
}) {
  return (
    <Field>
      <Label>Space backing</Label>
      <Select value={value} disabled={disabled} onChange={(next) => {
        if (next === 'git' || next === 'files') onChange(next)
      }}>
        <option value="git">Git repository</option>
        <option value="files">Files</option>
      </Select>
      <Description>
        {value === 'files'
          ? 'A shared place for documents, presentations and other artifacts. Agent runs and persistent files are coming soon.'
          : 'Agents work in a repository and deliver changes through pull requests.'}
        {' '}Backing is fixed when the space is created.
      </Description>
    </Field>
  )
}
