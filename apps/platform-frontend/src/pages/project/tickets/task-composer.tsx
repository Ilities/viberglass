import { Button } from '@/components/button'
import { useAuth } from '@/context/auth-context'
import { postTaskMessage } from '@/service/api/discussion-api'
import { getPeopleDirectory } from '@/service/api/user-api'
import { agentMentionToken, mentionToken } from '@viberglass/types'
import { useEffect, useMemo, useState } from 'react'
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
  onPosted: () => void
}

/** Writing in a task's thread, with @mentions of people, and of agents to ask them. */
export function TaskComposer({ taskId, agents, onPosted }: TaskComposerProps) {
  const { user } = useAuth()
  const [people, setPeople] = useState<Mentionable[]>([])
  const [draft, setDraft] = useState('')
  const [picked, setPicked] = useState<Mentionable[]>([])
  const [isPosting, setIsPosting] = useState(false)

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

  function pick(entry: Mentionable) {
    setDraft((current) => current.replace(/@[\p{L}\p{N}._-]{0,30}$/u, `@${entry.name} `))
    setPicked((current) => (current.some((other) => other.id === entry.id) ? current : [...current, entry]))
  }

  async function post() {
    setIsPosting(true)
    try {
      const { turn } = await postTaskMessage(taskId, withMentionTokens(draft, picked))
      setDraft('')
      setPicked([])
      if (turn) toast.success(turn.status === 'queued' ? 'The agent will read it when it finishes its turn' : 'Asked the agent')
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
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        rows={3}
        placeholder="Write a message. Type @ to mention someone, or the agent to ask it."
        className="w-full rounded-lg border border-[var(--gray-6)] bg-[var(--gray-1)] p-3 text-sm text-[var(--gray-12)] focus:border-[var(--accent-8)] focus:outline-none"
      />
      {suggestions.length > 0 && (
        <ul role="listbox" aria-label="Mention" className="absolute z-10 rounded-lg border border-[var(--gray-6)] bg-[var(--gray-1)] p-1 shadow">
          {suggestions.map((entry) => (
            <li key={`${entry.kind}:${entry.id}`}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => pick(entry)}
                className="flex w-full items-baseline gap-2 rounded px-3 py-1.5 text-left text-sm hover:bg-[var(--gray-3)]"
              >
                {entry.name}
                {entry.kind === 'agent' && <span className="text-xs text-[var(--gray-10)]">agent</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-[var(--gray-10)]">People on this task see this. Mention the agent to ask it; it reads the thread when asked.</p>
        <Button color="brand" disabled={isPosting || draft.trim().length === 0} onClick={() => void post()}>
          {isPosting ? 'Posting…' : 'Post'}
        </Button>
      </div>
    </div>
  )
}
