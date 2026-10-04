import { Button } from '@/components/button'
import { useAuth } from '@/context/auth-context'
import { interruptAgent, postTaskMessage } from '@/service/api/discussion-api'
import { getPeopleDirectory } from '@/service/api/user-api'
import { agentMentionToken, mentionToken } from '@viberglass/types'
import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react'
import { toast } from 'sonner'

/** Someone or something a message can mention. */
export interface Mentionable {
  kind: 'user' | 'agent'
  id: string
  name: string
}

/** The @word being typed at the end of the draft, if any. */
function mentionQuery(draft: string): string | null {
  const match = /(?:^|\s)@([\p{L}\p{N}._-]{0,30})$/u.exec(draft)
  return match ? match[1].toLowerCase() : null
}

/** Turns each picked "@Name" into a mention the server can read. */
function withMentionTokens(draft: string, picked: Mentionable[]): string {
  return picked.reduce((text, entry) => {
    const token = entry.kind === 'agent' ? agentMentionToken(entry.name, entry.id) : mentionToken(entry.name, entry.id)
    return text.split(`@${entry.name}`).join(token)
  }, draft)
}

interface TaskComposerProps {
  taskId: string
  /** The agents that can be asked, the one already on the task first. */
  agents: Mentionable[]
  /** Whether the person may stop the agent's running turn with their message. */
  canInterrupt?: boolean
  onPosted: () => void
}

/** Writing in a task's thread, with @mentions of people, and of agents to ask them. */
export function TaskComposer({ taskId, agents, canInterrupt = false, onPosted }: TaskComposerProps) {
  const { user } = useAuth()
  const [people, setPeople] = useState<Mentionable[]>([])
  const [draft, setDraft] = useState('')
  const [picked, setPicked] = useState<Mentionable[]>([])
  const [isPosting, setIsPosting] = useState(false)
  const [active, setActive] = useState(0)
  /** The @query Escape closed the list for; typing on opens it again. */
  const [dismissed, setDismissed] = useState<string | null>(null)
  const listId = useId()

  useEffect(() => {
    getPeopleDirectory()
      .then((directory) => setPeople(directory.map((person) => ({ kind: 'user', id: person.id, name: person.name }))))
      .catch(() => undefined)
  }, [])

  const query = mentionQuery(draft)
  const suggestions = useMemo(
    () =>
      query === null
        ? []
        : [...agents, ...people.filter((person) => person.id !== user?.id)]
            .filter((entry) => entry.name.toLowerCase().includes(query) || (entry.kind === 'agent' && 'agent'.startsWith(query)))
            .slice(0, 6),
    [agents, people, query, user?.id]
  )
  const open = suggestions.length > 0 && dismissed !== query
  const activeIndex = Math.min(active, suggestions.length - 1)

  function pick(entry: Mentionable) {
    setDraft((current) => current.replace(/@[\p{L}\p{N}._-]{0,30}$/u, `@${entry.name} `))
    setPicked((current) => (current.some((other) => other.id === entry.id) ? current : [...current, entry]))
    setActive(0)
  }

  // The list follows the combobox pattern: arrows move, Enter or Tab picks, Escape closes; with it closed, keys type as usual.
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!open) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((activeIndex + step + suggestions.length) % suggestions.length)
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      pick(suggestions[activeIndex])
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setDismissed(query)
    }
  }

  async function post(interrupt = false) {
    setIsPosting(true)
    try {
      const body = withMentionTokens(draft, picked)
      const turn = interrupt ? await interruptAgent(taskId, body) : (await postTaskMessage(taskId, body)).turn
      setDraft('')
      setPicked([])
      if (interrupt) toast.success('Stopped the agent; it starts again with your message')
      else if (turn) toast.success(turn.status === 'queued' ? 'The agent will read it when it finishes its turn' : turn.status === 'paused' ? 'The agent will read it when it carries on' : 'Asked the agent')
      onPosted()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to post the message')
    } finally {
      setIsPosting(false)
    }
  }

  return (
    <div className="relative space-y-2">
      <textarea
        aria-label="Write a message"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${activeIndex}` : undefined}
        value={draft}
        onKeyDown={onKeyDown}
        onChange={(event) => {
          setDraft(event.target.value)
          setActive(0)
        }}
        rows={3}
        placeholder="Write a message. Type @ to mention someone, or the agent to ask it."
        className="w-full rounded-lg border border-[var(--gray-6)] bg-[var(--gray-1)] p-3 text-sm text-[var(--gray-12)] focus:border-[var(--accent-8)] focus:outline-none"
      />
      <ul
        id={listId}
        role="listbox"
        aria-label="Mention"
        hidden={!open}
        className="absolute z-10 rounded-lg border border-[var(--gray-6)] bg-[var(--gray-1)] p-1 shadow"
      >
        {open &&
          suggestions.map((entry, index) => (
            <li
              key={`${entry.kind}:${entry.id}`}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              // Keeps focus in the textarea, so typing carries on after a pick.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(entry)}
              className={`flex cursor-pointer items-baseline gap-2 rounded px-3 py-1.5 text-sm ${index === activeIndex ? 'bg-[var(--gray-4)]' : 'hover:bg-[var(--gray-3)]'}`}
            >
              {entry.name}
              {entry.kind === 'agent' && <span className="text-xs text-[var(--gray-10)]">agent</span>}
            </li>
          ))}
      </ul>
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-[var(--gray-10)]">People on this task see this. Mention the agent to ask it; it reads the thread when asked.</p>
        <div className="flex shrink-0 gap-2">
          {canInterrupt && (
            <Button outline disabled={isPosting || draft.trim().length === 0} onClick={() => void post(true)}>
              Interrupt with this
            </Button>
          )}
          <Button color="brand" disabled={isPosting || draft.trim().length === 0} onClick={() => void post()}>
            {isPosting ? 'Posting…' : 'Post'}
          </Button>
        </div>
      </div>
    </div>
  )
}
