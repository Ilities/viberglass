import { Button } from '@/components/button'
import { Description, Label } from '@/components/fieldset'
import { Subheading } from '@/components/heading'
import { Input } from '@/components/input'
import { Link } from '@/components/link'
import { Radio, RadioField, RadioGroup } from '@/components/radio'
import { Switch } from '@/components/switch'
import { Text } from '@/components/text'
import { saveSpaceIssueRules, type ConnectionSpaceRule, type TrackerIssueRule } from '@/service/api/integration-api'
import type { TrackerWebhookDescriptor } from '@viberglass/integration-core/frontend'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

export interface TrackerConnection {
  id: string
  name: string
  system: string
  tracker: TrackerWebhookDescriptor
  hasWebhook: boolean
  /** Every space's rules for the connection, this one's included. */
  rules: ConnectionSpaceRule[]
}

interface TrackerIssuesCardProps {
  projectId: string
  connection: TrackerConnection
  /** `owner/repo` of the space's repository, if it has one. */
  repository: string | null
  isEditing: boolean
  editDisabled: boolean
  onEdit: () => void
  onClose: () => void
  onSaved: (rules: TrackerIssueRule[]) => void
}

type Mode = 'off' | 'every' | 'labelled'

function parseLabels(text: string): string[] {
  const labels = new Map<string, string>()
  for (const raw of text.split(',')) {
    const label = raw.trim()
    if (label) labels.set(label.toLowerCase(), label)
  }
  return [...labels.values()]
}

export function TrackerIssuesCard({
  projectId,
  connection,
  repository,
  isEditing,
  editDisabled,
  onEdit,
  onClose,
  onSaved,
}: TrackerIssuesCardProps) {
  const { tracker } = connection
  const needsRepository = tracker.issuesInRepository && !repository
  const editRef = useRef<HTMLElement>(null)
  const editorRef = useRef<HTMLFormElement>(null)
  const labelsRef = useRef<HTMLInputElement>(null)
  const wasEditing = useRef(false)
  const own = useMemo(() => connection.rules.filter((rule) => rule.projectId === projectId), [connection.rules, projectId])
  const saved = useMemo(
    (): { mode: Mode; labels: string; plan: boolean } => ({
      mode: own.length === 0 ? 'off' : own.some((rule) => rule.label) ? 'labelled' : 'every',
      labels: own.flatMap((rule) => (rule.label ? [rule.label] : [])).join(', '),
      plan: own.some((rule) => rule.planNewIssues),
    }),
    [own]
  )
  const [mode, setMode] = useState<Mode>(saved.mode)
  const [labelsText, setLabelsText] = useState(saved.labels)
  const [plan, setPlan] = useState(saved.plan)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setMode(saved.mode)
    setLabelsText(saved.labels)
    setPlan(saved.plan)
  }, [saved])

  const labels = parseLabels(labelsText)
  const changed =
    mode !== saved.mode ||
    (mode === 'labelled' && labels.join(',') !== parseLabels(saved.labels).join(',')) ||
    (mode !== 'off' && plan !== saved.plan)
  const summary = saved.mode === 'off' ? 'None' : saved.mode === 'every' ? `All ${tracker.items}` : `Labels: ${saved.labels}`
  const scope = [
    connection.name !== tracker.tracker ? tracker.tracker : null,
    tracker.issuesInRepository ? repository : null,
  ].filter(Boolean).join(' · ')

  useEffect(() => {
    if (isEditing) {
      editorRef.current?.querySelector<HTMLElement>('[role="radio"][data-state="checked"]')?.focus()
    } else if (wasEditing.current) {
      editRef.current?.focus()
    }
    wasEditing.current = isEditing
  }, [isEditing])

  function cancel() {
    setMode(saved.mode)
    setLabelsText(saved.labels)
    setPlan(saved.plan)
    setError(null)
    onClose()
  }
  const elsewhere = labels.flatMap((label) =>
    connection.rules
      .filter((rule) => rule.projectId !== projectId && rule.label?.toLowerCase() === label.toLowerCase())
      .map((rule) => `${label} (${rule.projectName})`)
  )

  async function save() {
    if (busy || !changed) return
    if (mode === 'labelled' && labels.length === 0) {
      setError(`Enter at least one label, or choose All ${tracker.items}.`)
      labelsRef.current?.focus()
      return
    }
    setBusy(true)
    setError(null)
    try {
      const rules =
        mode === 'off'
          ? []
          : mode === 'every'
            ? [{ label: null, planNewIssues: plan }]
            : labels.map((label) => ({ label, planNewIssues: plan }))
      onSaved(await saveSpaceIssueRules(projectId, connection.id, rules))
      onClose()
      toast.success(`${connection.name} issue settings saved`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      aria-labelledby={`connection-${connection.id}`}
      className="border-b border-zinc-950/10 last:border-b-0 dark:border-white/10"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-4 @min-[560px]:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_6rem_3.5rem]">
        <div className="col-start-1 row-start-1 min-w-0">
          <Subheading id={`connection-${connection.id}`} className="break-words">{connection.name}</Subheading>
          {scope && (
            <Text className="mt-0.5 break-words text-xs">
              {scope}
            </Text>
          )}
          {needsRepository ? (
            <Link className="mt-1 inline-block text-xs" href="../repository" relative="path">Set a repository first</Link>
          ) : !connection.hasWebhook ? (
            <Link className="mt-1 inline-block text-xs" href={`/settings/connections/${connection.id}`}>Webhook setup needed</Link>
          ) : null}
        </div>
        <div className="col-span-2 col-start-1 row-start-2 min-w-0 text-sm @min-[560px]:col-span-1 @min-[560px]:col-start-2 @min-[560px]:row-start-1">
          <span className="text-zinc-500 @min-[560px]:sr-only dark:text-zinc-400">Create tasks for: </span>
          <span className="break-words">{needsRepository ? 'None' : summary}</span>
        </div>
        <div className="col-span-2 col-start-1 row-start-3 text-sm @min-[560px]:col-span-1 @min-[560px]:col-start-3 @min-[560px]:row-start-1">
          <span className="text-zinc-500 @min-[560px]:sr-only dark:text-zinc-400">Automatic planning: </span>
          {needsRepository || saved.mode === 'off' ? '—' : saved.plan ? 'On' : 'Off'}
        </div>
        <Button
          ref={editRef}
          outline
          className="col-start-2 row-start-1 @min-[560px]:col-start-4"
          aria-label={`Edit ${connection.name}`}
          aria-expanded={isEditing}
          aria-controls={`editor-${connection.id}`}
          disabled={editDisabled || isEditing || needsRepository}
          title={editDisabled ? 'Save or cancel the open editor first' : undefined}
          onClick={onEdit}
        >
          Edit
        </Button>
      </div>

      {isEditing && !needsRepository && (
        <form
          ref={editorRef}
          id={`editor-${connection.id}`}
          aria-label={`Edit ${connection.name} issue routing`}
          className="border-t border-zinc-950/10 bg-zinc-950/[0.02] px-5 py-5 dark:border-white/10 dark:bg-white/[0.02]"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <fieldset disabled={busy} className="max-w-lg space-y-5">
            {!connection.hasWebhook && (
              <Text className="text-sm">
                Tasks will start arriving once a workspace admin sets up the webhook in{' '}
                <Link href={`/settings/connections/${connection.id}`}>connection settings</Link>.
              </Text>
            )}
            <div className="space-y-3">
              <Label id={`mode-${connection.id}`}>Create tasks for</Label>
              <RadioGroup
                value={mode}
                onChange={(value) => {
                  setMode(value === 'every' || value === 'labelled' ? value : 'off')
                  setError(null)
                }}
                aria-labelledby={`mode-${connection.id}`}
                disabled={busy}
              >
                <RadioField><Radio value="off" /><Label>None</Label></RadioField>
                <RadioField><Radio value="every" /><Label>All {tracker.items}</Label></RadioField>
                <RadioField><Radio value="labelled" /><Label>Matching labels</Label></RadioField>
              </RadioGroup>
            </div>

            {mode === 'labelled' && (
              <div className="space-y-1.5">
                <Label htmlFor={`labels-${connection.id}`}>Labels</Label>
                <Input
                  ref={labelsRef}
                  id={`labels-${connection.id}`}
                  value={labelsText}
                  onChange={(event) => {
                    setLabelsText(event.target.value)
                    setError(null)
                  }}
                  placeholder="e.g. frontend, checkout"
                  aria-describedby={`labels-help-${connection.id}${error ? ` error-${connection.id}` : ''}`}
                  aria-invalid={Boolean(error) && labels.length === 0}
                />
                <Description id={`labels-help-${connection.id}`}>
                  Separate labels with commas. Only one label needs to match.
                </Description>
                {elsewhere.length > 0 && (
                  <Text className="mt-2 text-sm">
                    These labels also create tasks in other spaces: {elsewhere.join(', ')}.
                    A matching {tracker.item} gets a task in each space.
                  </Text>
                )}
              </div>
            )}

            {mode !== 'off' && (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <Switch
                    id={`plan-${connection.id}`}
                    aria-label="Automatically write a plan"
                    aria-describedby={`plan-help-${connection.id}`}
                    checked={plan}
                    disabled={busy}
                    onChange={setPlan}
                  />
                  <Label htmlFor={`plan-${connection.id}`}>Automatically write a plan</Label>
                </div>
                <Description id={`plan-help-${connection.id}`}>
                  {plan
                    ? 'The agent starts planning as soon as a new task arrives.'
                    : `Tasks wait until you ask the agent to plan, here or by mentioning the bot on the ${tracker.item}.`}
                </Description>
              </div>
            )}

            {error && <p id={`error-${connection.id}`} role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <div className="flex gap-3">
              <Button type="submit" color="brand" disabled={busy || !changed}>
                {busy ? 'Saving…' : 'Save'}
              </Button>
              <Button outline disabled={busy} onClick={cancel}>Cancel</Button>
            </div>
          </fieldset>
        </form>
      )}
    </section>
  )
}
