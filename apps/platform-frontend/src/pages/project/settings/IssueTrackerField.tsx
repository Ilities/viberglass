import { Button } from '@/components/button'
import { Field, Label } from '@/components/fieldset'
import { Select } from '@/components/select'
import { Text } from '@/components/text'
import { NO_SELECTION, type ConnectionOption } from './RepositoryFields'

interface IssueTrackerFieldProps {
  trackers: ConnectionOption[]
  value: string
  onChange: (id: string) => void
  isLoading: boolean
  /** Where a tracker gets linked or created when there is none to choose. */
  connectionsHref: string
}

/** Where a space's tasks live: in Viberglass alone, or synced with a tracker. */
export function IssueTrackerField({ trackers, value, onChange, isLoading, connectionsHref }: IssueTrackerFieldProps) {
  if (!isLoading && trackers.length === 0) {
    return (
      <div>
        <Label>Issue tracker</Label>
        <div className="mt-2 flex items-center justify-between gap-4">
          <Text>Tasks live in Viberglass</Text>
          <Button outline href={connectionsHref}>
            Link a tracker
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Field>
      <Label>Issue tracker</Label>
      <Select
        name="ticket_integration"
        value={value}
        onChange={(next) => {
          if (next !== '') onChange(next)
        }}
        disabled={isLoading}
      >
        <option value={NO_SELECTION}>{isLoading ? 'Loading…' : 'None: tasks live in Viberglass'}</option>
        {trackers.map((tracker) => (
          <option key={tracker.id} value={tracker.id}>
            {tracker.label}
          </option>
        ))}
      </Select>
    </Field>
  )
}
