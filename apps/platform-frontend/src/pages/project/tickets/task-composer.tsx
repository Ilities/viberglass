import { Button } from '@/components/button'
import { useAuth } from '@/context/auth-context'
import { interruptAgent, MESSAGE_IMAGE_LIMIT, postTaskMessage } from '@/service/api/discussion-api'
import { getPeopleDirectory } from '@/service/api/user-api'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { toast } from 'sonner'
import type { ComposerDraft, Mentionable } from './composer-draft'
import { ComposerImages, imageFiles, MESSAGE_IMAGE_TYPES } from './message-images'

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

/** Writing in a task's thread, with @mentions of people, and of agents to ask them, and images pasted, dropped or picked. */
export function TaskComposer({ taskId, agents, draft, agentWorking = false, canInterrupt = false, onPosted }: TaskComposerProps) {
  const { user } = useAuth()
  const [people, setPeople] = useState<Mentionable[]>([])
  const [isPosting, setIsPosting] = useState(false)
  const [active, setActive] = useState(0)
  /** The @query Escape closed the list for; typing on opens it again. */
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [images, setImages] = useState<File[]>([])
  const picker = useRef<HTMLInputElement>(null)
  const listId = useId()
  const empty = draft.isEmpty && images.length === 0

  function attach(files: File[]) {
    if (files.length === 0) return
    const room = MESSAGE_IMAGE_LIMIT - images.length
    if (files.length > room) toast.error(`A message can carry up to ${MESSAGE_IMAGE_LIMIT} images.`)
    if (room > 0) setImages([...images, ...files.slice(0, room)])
  }

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
      const turn = interrupt ? await interruptAgent(taskId, body) : (await postTaskMessage(taskId, body, {}, images)).turn
      draft.clear()
      setImages([])
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
    <div
      className="relative space-y-2 border-t border-[var(--gray-5)] pt-5"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) event.preventDefault()
      }}
      onDrop={(event) => {
        const dropped = imageFiles(event.dataTransfer.files)
        if (dropped.length === 0) return
        event.preventDefault()
        attach(dropped)
      }}
    >
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
        onPaste={(event) => {
          const pasted = imageFiles(event.clipboardData.files)
          if (pasted.length === 0) return
          event.preventDefault()
          attach(pasted)
        }}
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
      <ComposerImages images={images} onRemove={(image) => setImages(images.filter((other) => other !== image))} />
      <input
        ref={picker}
        type="file"
        multiple
        hidden
        accept={MESSAGE_IMAGE_TYPES.join(',')}
        aria-label="Attach images"
        onChange={(event) => {
          attach(imageFiles(event.target.files))
          event.target.value = ''
        }}
      />
      <div className="flex justify-end gap-2">
        <Button outline className="mr-auto" disabled={isPosting || images.length >= MESSAGE_IMAGE_LIMIT} onClick={() => picker.current?.click()}>
          Attach images
        </Button>
        {/* Interrupting sends text only; images go with the message after this turn. */}
        {agentWorking && canInterrupt && images.length === 0 && (
          <Button outline disabled={isPosting || draft.isEmpty} onClick={() => void post(true)}>
            Send now and interrupt
          </Button>
        )}
        <Button color="brand" disabled={isPosting || empty} onClick={() => void post()}>
          {isPosting ? 'Sending…' : agentWorking ? 'Send after this turn' : 'Send'}
        </Button>
      </div>
    </div>
  )
}
