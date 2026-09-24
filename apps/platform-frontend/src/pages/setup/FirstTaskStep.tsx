import { Button } from '@/components/button'
import { Description, Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Textarea } from '@/components/textarea'
import { Text, TextLink } from '@/components/text'
import { createTicket, runResearch } from '@/service/api/ticket-api'
import type { CreatedSpace } from '@viberglass/types'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SetupError, SetupFrame } from './SetupFrame'

const STARTER_TITLE = 'Explain how this codebase is organised'
const STARTER_DESCRIPTION =
  'Describe the main parts of this repository, how they fit together, and where a newcomer should start reading. Only read the code; change nothing.'

export function FirstTaskStep({
  space,
  clankerId,
}: {
  space: Pick<CreatedSpace, 'projectId' | 'slug'>
  clankerId: string
}) {
  const navigate = useNavigate()
  const [title, setTitle] = useState(STARTER_TITLE)
  const [description, setDescription] = useState(STARTER_DESCRIPTION)
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
        ticketSystem: 'custom',
        metadata: {
          timestamp: new Date().toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        annotations: [],
        autoFixRequested: false,
      })
      await runResearch(ticket.id, clankerId)
      navigate(`/project/${space.slug}/tickets/${ticket.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the task.")
      setIsStarting(false)
    }
  }

  return (
    <SetupFrame
      step={5}
      title="Try your first task"
      intro="Ask for something small. The agent researches it in your repository and writes up what it found for you to review."
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
          <Description>This starter only reads your code, so it's safe to try.</Description>
        </Field>
        <Button type="submit" className="w-full" disabled={isStarting || !title.trim() || !description.trim()}>
          {isStarting ? 'Starting…' : 'Start the task'}
        </Button>
        <Text>
          Or <TextLink href={`/project/${space.slug}`}>go to the space</TextLink> and start with your own task.
        </Text>
      </form>
    </SetupFrame>
  )
}
