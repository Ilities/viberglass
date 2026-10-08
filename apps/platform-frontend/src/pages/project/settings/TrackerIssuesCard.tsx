import { Button } from '@/components/button'
import { Description, Label } from '@/components/fieldset'
import { Subheading } from '@/components/heading'
import { Input } from '@/components/input'
import { Link } from '@/components/link'
import { Radio, RadioField, RadioGroup } from '@/components/radio'
import { Switch, SwitchField } from '@/components/switch'
import { Text } from '@/components/text'
import { saveSpaceIssueRules, type ConnectionSpaceRule, type TrackerIssueRule } from '@/service/api/integration-api'
import type { TrackerWebhookDescriptor } from '@viberglass/integration-core/frontend'
import { useEffect, useMemo, useState } from 'react'

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
  /** `owner/repo` of the space's GitHub repository, for a GitHub connection. */
  repository: string | null
  onSaved: (rules: TrackerIssueRule[]) => void
}

type Mode = 'every' | 'labelled'

function parseLabels(text: string): string[] {
  const labels = new Map<string, string>()
  for (const raw of text.split(',')) {
    const label = raw.trim()
    if (label) labels.set(label.toLowerCase(), label)
  }
  return [...labels.values()]
}

/** Which of one tracker connection's issues the space takes, and whether the agent plans them straight away. */
export function TrackerIssuesCard({ projectId, connection, repository, onSaved }: TrackerIssuesCardProps) {
  const { tracker } = connection
  const isGitHub = connection.system === 'github'
  const own = useMemo(() => connection.rules.filter((rule) => rule.projectId === projectId), [connection.rules, projectId])
  const saved = useMemo(
    (): { mode: Mode; labels: string; plan: boolean } => ({
      mode: own.some((rule) => rule.label) ? 'labelled' : 'every',
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
  const byLabel = isGitHub ? mode === 'labelled' : true
  const changed = mode !== saved.mode || labels.join(',') !== parseLabels(saved.labels).join(',') || plan !== saved.plan
  const elsewhere = labels.flatMap((label) =>
    connection.rules
      .filter((rule) => rule.projectId !== projectId && rule.label?.toLowerCase() === label.toLowerCase())
      .map((rule) => `${label} (${rule.projectName})`)
  )

  async function save() {
    if (isGitHub && byLabel && labels.length === 0) {
      setError(`Add a label, or take every ${tracker.item}.`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const rules = byLabel
        ? labels.map((label) => ({ label, planNewIssues: plan }))
        : plan
          ? [{ label: null, planNewIssues: true }]
          : []
      onSaved(await saveSpaceIssueRules(projectId, connection.id, rules))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="app-frame space-y-5 rounded-lg p-6">
      <div>
        <Subheading>{connection.name}</Subheading>
        {!connection.hasWebhook && (
          <Text className="mt-1 text-sm">
            Nothing arrives from {tracker.tracker} until the connection&apos;s webhook is set up, by a workspace admin in{' '}
            <Link href={`/settings/connections/${connection.id}`}>its settings</Link>.
          </Text>
        )}
      </div>

      {isGitHub && !repository ? (
        <Text className="text-sm">
          The space takes GitHub issues from its repository, and it has no GitHub repository yet.
        </Text>
      ) : (
        <>
          {isGitHub && (
            <RadioGroup value={mode} onChange={(value) => setMode(value === 'labelled' ? 'labelled' : 'every')} aria-label="Which issues">
              <RadioField>
                <Radio value="every" />
                <Label>Every issue in {repository}</Label>
              </RadioField>
              <RadioField>
                <Radio value="labelled" />
                <Label>Only issues in {repository} with one of these labels</Label>
              </RadioField>
            </RadioGroup>
          )}

          {byLabel && (
            <div className="max-w-md">
              <Label htmlFor={`labels-${connection.id}`}>Labels</Label>
              <Input
                id={`labels-${connection.id}`}
                value={labelsText}
                onChange={(event) => setLabelsText(event.target.value)}
                placeholder="e.g. frontend, checkout"
              />
              <Description>
                {isGitHub
                  ? `Separate labels with commas.`
                  : `The space takes every ${tracker.item} with one of these labels, from anywhere in ${tracker.tracker}. Separate labels with commas.`}
              </Description>
              {elsewhere.length > 0 && (
                <Text className="mt-2 text-sm">
                  Also taken by other spaces: {elsewhere.join(', ')}. A {tracker.item} with one of them gets a task in each.
                </Text>
              )}
            </div>
          )}

          <SwitchField>
            <Label>Write the plan for new {tracker.items}</Label>
            <Description>
              Off, the task waits until someone asks the agent, here or by mentioning the bot on the {tracker.item}.
            </Description>
            <Switch aria-label={`Write the plan for new ${tracker.items}`} checked={plan} onChange={setPlan} />
          </SwitchField>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          {changed && (
            <div className="flex gap-3">
              <Button color="brand" onClick={() => void save()} disabled={busy}>
                {busy ? 'Saving…' : 'Save'}
              </Button>
              <Button
                outline
                disabled={busy}
                onClick={() => {
                  setMode(saved.mode)
                  setLabelsText(saved.labels)
                  setPlan(saved.plan)
                  setError(null)
                }}
              >
                Cancel
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
