import { Button } from '@/components/button'
import { useAuth } from '@/context/auth-context'
import { postTaskMessage } from '@/service/api/discussion-api'
import { getPeopleDirectory, type Person } from '@/service/api/user-api'
import { mentionToken } from '@viberglass/types'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

/** The @word being typed at the end of the draft, if any. */
function mentionQuery(draft: string): string | null {
  const match = /(?:^|\s)@([\p{L}\p{N}._-]{0,30})$/u.exec(draft)
  return match ? match[1].toLowerCase() : null
}

/** Turns each picked person's "@Name" into a mention the server can read. */
function withMentionTokens(draft: string, picked: Person[]): string {
  return picked.reduce((text, person) => text.split(`@${person.name}`).join(mentionToken(person.name, person.id)), draft)
}

/** Writing in a task's thread, with @mentions of people. */
export function TaskComposer({ taskId, onPosted }: { taskId: string; onPosted: () => void }) {
  const { user } = useAuth()
  const [people, setPeople] = useState<Person[]>([])
  const [draft, setDraft] = useState('')
  const [picked, setPicked] = useState<Person[]>([])
  const [isPosting, setIsPosting] = useState(false)

  useEffect(() => {
    getPeopleDirectory()
      .then(setPeople)
      .catch(() => undefined)
  }, [])

  const query = mentionQuery(draft)
  const suggestions = useMemo(
    () =>
      query === null
        ? []
        : people.filter((person) => person.id !== user?.id && person.name.toLowerCase().includes(query)).slice(0, 5),
    [people, query, user?.id]
  )

  function pick(person: Person) {
    setDraft((current) => current.replace(/@[\p{L}\p{N}._-]{0,30}$/u, `@${person.name} `))
    setPicked((current) => (current.some((entry) => entry.id === person.id) ? current : [...current, person]))
  }

  async function post() {
    setIsPosting(true)
    try {
      await postTaskMessage(taskId, withMentionTokens(draft, picked))
      setDraft('')
      setPicked([])
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
        placeholder="Write a message. Type @ to mention someone."
        className="w-full rounded-lg border border-[var(--gray-6)] bg-[var(--gray-1)] p-3 text-sm text-[var(--gray-12)] focus:border-[var(--accent-8)] focus:outline-none"
      />
      {suggestions.length > 0 && (
        <ul role="listbox" aria-label="People to mention" className="absolute z-10 rounded-lg border border-[var(--gray-6)] bg-[var(--gray-1)] p-1 shadow">
          {suggestions.map((person) => (
            <li key={person.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => pick(person)}
                className="w-full rounded px-3 py-1.5 text-left text-sm hover:bg-[var(--gray-3)]"
              >
                {person.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-between gap-4">
        {/* Until the agent can be brought into the thread (ADR 0008), say who reads it. */}
        <p className="text-xs text-[var(--gray-10)]">People on this task see this. The agent doesn't read it yet.</p>
        <Button color="brand" disabled={isPosting || draft.trim().length === 0} onClick={() => void post()}>
          {isPosting ? 'Posting…' : 'Post'}
        </Button>
      </div>
    </div>
  )
}
