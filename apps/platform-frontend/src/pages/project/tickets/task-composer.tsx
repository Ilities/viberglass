import { Button } from '@/components/button'
import { useAuth } from '@/context/auth-context'
import { interruptAgent, postTaskMessage } from '@/service/api/discussion-api'
import { getPeopleDirectory } from '@/service/api/user-api'
import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react'
import { toast } from 'sonner'
import type { ComposerDraft, Mentionable } from './composer-draft'

export type { Mentionable } from './composer-draft'

/** The @word being typed at the end of the draft, if any. */
function mentionQuery(draft: string): string | null {
  const match = /(?:^|\s)@([\p{L}\p{N}._-]{0,30})$/u.exec(draft)
  return match ? match[1].toLowerCase() : null
}

interface TaskComposerProps {
  taskId: string
  /** The agents that can be asked, the one already on the task first. */
  agents: Mentionable[]
  draft: ComposerDraft
  /** Whether an agent turn is running, so a message waits for it to finish. */
  agentWorking?: boolean
  /** Whether the person may stop the agent's running turn with their message. */
  canInterrupt?: boolean
  onPosted: () => void
}

/** Writing in a task's thread, with @mentions of people, and of agents to ask them. */
export function TaskComposer({ taskId, agents, draft, agentWorking = false, canInterrupt = false, onPosted }: TaskComposerProps) {
  const { user } = useAuth()
  const [people, setPeople] = useState<Mentionable[]>([])
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

  const query = mentionQuery(draft.text)
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
    draft.pick(entry)
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
      const body = draft.body()
      const turn = interrupt ? await interruptAgent(taskId, body) : (await postTaskMessage(taskId, body)).turn
      draft.clear()
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
    <div className="relative space-y-2 border-t border-[var(--gray-5)] pt-5">
      <textarea
        id={`${listId}-input`}
        aria-label="Write a message"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${activeIndex}` : undefined}
        value={draft.text}
        onKeyDown={onKeyDown}
        onChange={(event) => {
          draft.setText(event.target.value)
          setActive(0)
        }}
        rows={4}
        placeholder={agents.length > 0 ? 'Write a message… Type @ to ask the agent or bring someone in.' : 'Write a message… Type @ to bring someone in.'}
        className="min-h-[95px] w-full resize-y rounded-[7px] border border-[var(--gray-7)] bg-[var(--gray-1)] p-3 text-sm leading-normal text-[var(--gray-12)] focus:border-[var(--accent-8)] focus:outline-none"
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
      <div className="flex justify-end gap-2">
        {agentWorking && canInterrupt && (
          <Button outline disabled={isPosting || draft.isEmpty} onClick={() => void post(true)}>
            Send now and interrupt
          </Button>
        )}
        <Button color="brand" disabled={isPosting || draft.isEmpty} onClick={() => void post()}>
          {isPosting ? 'Sending…' : agentWorking ? 'Send after this turn' : 'Send'}
        </Button>
      </div>
    </div>
  )
}
