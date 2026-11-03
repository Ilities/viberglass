import { Button } from '@/components/button'
import { Description, Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Textarea } from '@/components/textarea'
import { Text, TextLink } from '@/components/text'
import { askAgent } from '@/service/api/discussion-api'
import { createTicket } from '@/service/api/ticket-api'
import { NATIVE_TICKET_ORIGIN, type CreatedSpace } from '@viberglass/types'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SetupError, SetupFrame } from './SetupFrame'
import { taskPath } from '@/lib/taskPath'

/** A small first task for each backing: reading a repository, writing a first file in a Files space, or building a first app. */
const STARTERS = {
  git: {
    title: 'Explain how this codebase is organised',
    description:
      'Describe the main parts of this repository, how they fit together, and where a newcomer should start reading. Only read the code; change nothing.',
    intro: 'Ask for something small. The agent reads your repository and answers in the task with what it found.',
    note: "This starter only reads your code, so it's safe to try.",
    // A plan would offer to build it; this starter asks for an answer and nothing else.
    ask: { action: 'reply', body: 'Please answer here in the task.' },
  },
  files: {
    title: 'Draft a one-page project brief',
    description:
      'Write BRIEF.md with the goals, audience and open questions for this space. Keep it to one page.',
    intro: 'Ask for something small. The agent writes in the space’s files, which are kept for the next run and every task in the space.',
    note: 'You can ask for changes in the task’s conversation afterwards.',
    // The work is the file itself, so the agent is asked directly rather than for a plan.
    ask: { action: 'reply', body: 'Please write this in the space’s files.' },
  },
  app: {
    title: 'Build a laptop tracker',
    description:
      'Build an app for keeping track of the company’s laptops: a list of laptops with their model, serial number, who has each one and its status, and a form to add or change one.',
    intro: 'Describe the app your team needs. The agent builds a first version, ready for you to look at.',
    note: 'Change the description to the app you actually need; you can ask for changes in the task afterwards.',
    ask: { action: 'code', body: 'Please build this.' },
  },
} as const

export function FirstTaskStep({
  space,
  clankerId,
}: {
  space: Pick<CreatedSpace, 'projectId' | 'slug' | 'backingKind'>
  clankerId: string
}) {
  const navigate = useNavigate()
  const starter = STARTERS[space.backingKind]
  const [title, setTitle] = useState<string>(starter.title)
  const [description, setDescription] = useState<string>(starter.description)
  const [error, setError] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsStarting(true)
    try {
      const ticket = await createTicket({
        projectId: space.projectId,
        title: title.trim(),
        description: description.trim(),
        severity: 'low',
        category: 'General',
        ticketSystem: NATIVE_TICKET_ORIGIN,
        metadata: {
          timestamp: new Date().toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        annotations: [],
        autoFixRequested: false,
      })
      await askAgent(ticket.id, { ...starter.ask, agentId: clankerId })
      navigate(taskPath(space.slug, ticket))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the task.")
      setIsStarting(false)
    }
  }

  return (
    <SetupFrame
      step={5}
      title="Try your first task"
      intro={starter.intro}
    >
      <form onSubmit={handleSubmit} className="grid gap-6">
        <SetupError message={error} />
        <Field>
          <Label>Task</Label>
          <Input name="title" value={title} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <Field>
          <Label>Details</Label>
          <Textarea
            name="description"
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <Description>{starter.note}</Description>
        </Field>
        <div>
          <Button type="submit" color="brand" disabled={isStarting || !title.trim() || !description.trim()}>
            {isStarting ? 'Starting…' : 'Start the task'}
          </Button>
        </div>
        <Text>
          Or <TextLink href={`/spaces/${space.slug}`}>go to the space</TextLink> and start with your own task.
        </Text>
      </form>
    </SetupFrame>
  )
}
