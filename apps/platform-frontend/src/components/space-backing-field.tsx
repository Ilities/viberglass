import { Description, Field, Label } from '@/components/fieldset'
import { Select } from '@/components/select'
import { SPACE_BACKING_LABELS } from '@/lib/spaceBacking'
import { SPACE_BACKING_KINDS, type SpaceBackingKind } from '@viberglass/types'

const DESCRIPTIONS: Record<SpaceBackingKind, string> = {
  git: 'Agents work in a repository and deliver changes through pull requests.',
  files: 'A shared place for documents, presentations and other artifacts. Its files persist between runs and are shared by all of its tasks.',
  app: 'One app for your team, which agents build and Viberglass runs. Viberglass creates and looks after its code for you.',
}

export function SpaceBackingField({ value, onChange, disabled, offerApp = false }: {
  value: SpaceBackingKind
  onChange: (value: SpaceBackingKind) => void
  disabled?: boolean
  offerApp?: boolean
}) {
  const kinds: SpaceBackingKind[] = offerApp ? ['app', ...SPACE_BACKING_KINDS.filter((kind) => kind !== 'app')] : SPACE_BACKING_KINDS.filter((kind) => kind !== 'app')
  return (
    <Field>
      <Label>Space backing</Label>
      <Select value={value} disabled={disabled} onChange={(next) => {
        const kind = kinds.find((candidate) => candidate === next)
        if (kind) onChange(kind)
      }}>
        {kinds.map((kind) => <option key={kind} value={kind}>{SPACE_BACKING_LABELS[kind]}</option>)}
      </Select>
      <Description>
        {DESCRIPTIONS[value]}{' '}Backing is fixed when the space is created.
      </Description>
    </Field>
  )
}
