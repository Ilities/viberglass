import { Description, Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { SegmentedControl } from '@/components/segmented-control'
import { Select } from '@/components/select'
import { Code } from '@/components/text'
import { buildCron, describeCron, formatTime, WEEKDAYS, type CronBuilder, type CronFrequency } from './cronSchedule'

const FREQUENCIES: { value: CronFrequency; label: string }[] = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'custom', label: 'Custom' },
]

const MONTH_DAYS = Array.from({ length: 28 }, (_, i) => i + 1)

function isFrequency(value: string): value is CronFrequency {
  return FREQUENCIES.some((f) => f.value === value)
}

interface Props {
  value: CronBuilder
  onChange: (value: CronBuilder) => void
  timezone: string
}

export function CronScheduleField({ value, onChange, timezone }: Props) {
  const set = (patch: Partial<CronBuilder>) => onChange({ ...value, ...patch })
  const expression = buildCron(value)
  const description = describeCron(expression)

  const setTime = (time: string) => {
    const [hour, minute] = time.split(':').map((part) => parseInt(part, 10))
    if (Number.isInteger(hour) && Number.isInteger(minute)) set({ hour, minute })
  }

  const timeInput = (
    <Input
      type="time"
      aria-label="Time"
      value={formatTime(value.hour, value.minute)}
      onChange={(e) => setTime(e.target.value)}
      className="w-32"
    />
  )

  return (
    <Field>
      <Label>Runs</Label>
      <div className="mt-3 flex flex-col gap-3">
        <SegmentedControl
          options={FREQUENCIES}
          value={value.frequency}
          onChange={(v) => isFrequency(v) && set({ frequency: v })}
        />
        {value.frequency === 'hourly' && (
          <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <span>At minute</span>
            <Input
              type="number"
              aria-label="Minute past the hour"
              min="0"
              max="59"
              value={value.minute}
              onChange={(e) => {
                const minute = parseInt(e.target.value, 10)
                if (minute >= 0 && minute <= 59) set({ minute })
              }}
              className="w-20"
            />
            <span>past the hour</span>
          </div>
        )}
        {value.frequency === 'daily' && timeInput}
        {value.frequency === 'weekly' && (
          <div className="flex items-center gap-2">
            <Select
              aria-label="Day of the week"
              value={String(value.weekday)}
              onChange={(v) => set({ weekday: parseInt(v, 10) })}
              className="w-40"
            >
              {WEEKDAYS.map((day, i) => (
                <option key={day} value={String(i)}>
                  {day}
                </option>
              ))}
            </Select>
            {timeInput}
          </div>
        )}
        {value.frequency === 'monthly' && (
          <div className="flex items-center gap-2">
            <Select
              aria-label="Day of the month"
              value={String(value.monthDay)}
              onChange={(v) => set({ monthDay: parseInt(v, 10) })}
              className="w-28"
            >
              {MONTH_DAYS.map((day) => (
                <option key={day} value={String(day)}>
                  Day {day}
                </option>
              ))}
            </Select>
            {timeInput}
          </div>
        )}
        {value.frequency === 'custom' && (
          <Input
            aria-label="Cron expression"
            value={value.custom}
            onChange={(e) => set({ custom: e.target.value })}
            placeholder="0 30 9 * * 1"
            className="font-mono"
            invalid={value.custom.trim() !== '' && !description}
          />
        )}
      </div>
      {value.frequency === 'custom' && (
        <Description>
          Six fields: second, minute, hour, day of month, month, day of week (0 is Sunday). Each takes *, a number or
          */N. The second must be a number.
        </Description>
      )}
      <ScheduleSummary expression={expression} description={description} timezone={timezone} />
    </Field>
  )
}

function ScheduleSummary({
  expression,
  description,
  timezone,
}: {
  expression: string
  description: string | null
  timezone: string
}) {
  if (!expression) return null
  if (!description) {
    return <p className="mt-3 text-sm text-red-600 dark:text-red-400">Not an expression the scheduler accepts.</p>
  }
  return (
    <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
      {description} ({timezone || 'UTC'}) <Code color="gray" className="ml-1">{expression}</Code>
    </p>
  )
}
