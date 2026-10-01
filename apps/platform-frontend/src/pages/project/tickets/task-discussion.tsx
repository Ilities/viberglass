import { Button } from '@/components/button'
import { Timestamp } from '@/components/timestamp'
import { useAuth } from '@/context/auth-context'
import { getTaskMessages, postTaskMessage } from '@/service/api/discussion-api'
import { getPeopleDirectory, type Person } from '@/service/api/user-api'
import { mentionToken, splitMentions, type TaskMessage } from '@viberglass/types'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { renderInline } from './document-inline'

/** The @word being typed at the end of the draft, if any. */
function mentionQuery(draft: string): string | null {
  const match = /(?:^|\s)@([\p{L}\p{N}._-]{0,30})$/u.exec(draft)
  return match ? match[1].toLowerCase() : null
}

/** Turns each picked person's "@Name" into a mention the server can read. */
function withMentionTokens(draft: string, picked: Person[]): string {
  return picked.reduce((text, person) => text.split(`@${person.name}`).join(mentionToken(person.name, person.id)), draft)
}

function MessageBody({ body }: { body: string }) {
  return (
    <p className="text-sm whitespace-pre-wrap text-[var(--gray-12)]">
      {splitMentions(body).map((part, index) =>
        'mention' in part ? (
          <span key={index} className="rounded bg-[var(--accent-3)] px-1 font-medium text-[var(--accent-11)]">
            @{part.mention.name}
          </span>
        ) : (
          <span key={index}>{renderInline(part.text)}</span>
        )
      )}
    </p>
  )
}

/** The task's Discussion: a thread for everyone on the task, with @mentions. */
export function TaskDiscussion({ taskId }: { taskId: string }) {
  const { user } = useAuth()
  const [messages, setMessages] = useState<TaskMessage[] | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [draft, setDraft] = useState('')
  const [picked, setPicked] = useState<Person[]>([])
  const [isPosting, setIsPosting] = useState(false)
  const canWrite = Boolean(user && user.role !== 'viewer')

  useEffect(() => {
    getTaskMessages(taskId)
      .then(setMessages)
      .catch(() => setMessages([]))
    getPeopleDirectory()
      .then(setPeople)
      .catch(() => undefined)
  }, [taskId])

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
      setMessages(await postTaskMessage(taskId, withMentionTokens(draft, picked)))
      setDraft('')
      setPicked([])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to post the message')
    } finally {
      setIsPosting(false)
    }
  }

  if (!messages) return null

  return (
    <div className="space-y-5">
      {messages.length === 0 ? (
        <p className="text-sm text-[var(--gray-10)]">No messages yet. Ask a question or bring someone in with @.</p>
      ) : (
        <ol className="space-y-4">
          {messages.map((message) => (
            <li key={message.id}>
              <p className="text-xs text-[var(--gray-10)]">
                <span className="font-medium text-[var(--gray-11)]">{message.author?.name ?? 'Someone'}</span> ·{' '}
                <Timestamp date={message.createdAt} />
              </p>
              <MessageBody body={message.body} />
            </li>
          ))}
        </ol>
      )}

      {canWrite && (
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
          <div className="flex justify-end">
            <Button color="brand" disabled={isPosting || draft.trim().length === 0} onClick={() => void post()}>
              {isPosting ? 'Posting…' : 'Post'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
