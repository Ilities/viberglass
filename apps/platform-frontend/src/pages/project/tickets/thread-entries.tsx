import { Button } from '@/components/button'
import { Timestamp } from '@/components/timestamp'
import type { TaskArtifactKind, TaskTimelineEntry } from '@viberglass/types'
import { useState } from 'react'
import { describeActivity } from './activity-sentence'
import { MessageBody } from './message-body'
import { ThreadItem } from './thread-item'

const ARTIFACT_NAME: Record<TaskArtifactKind, string> = { plan: 'Plan' }

const TRACKER_NAME: Record<string, string> = { jira: 'Jira', shortcut: 'Shortcut', github: 'GitHub' }

/** "on Jira": where a message from a linked tracker issue was written. */
export function trackerNote(source: string | null | undefined): string | undefined {
  if (!source) return undefined
  return `on ${TRACKER_NAME[source] ?? source}`
}

/** What someone wrote in the thread, or to the agent in its session; a comment on a linked tracker issue says where. */
export function MessageEntry({ entry }: { entry: Extract<TaskTimelineEntry, { kind: 'message' }> }) {
  const outsider = !entry.author && entry.externalAuthor !== null
  const note = entry.channel === 'session' ? 'to the agent' : trackerNote(entry.source ?? entry.externalAuthor?.source)
  return (
    <ThreadItem
      who={entry.author?.name ?? entry.externalAuthor?.name ?? 'Someone'}
      outsider={outsider}
      at={entry.at}
      note={note}
    >
      <MessageBody body={entry.body} />
    </ThreadItem>
  )
}

/** A new version of a document, as a card that opens it. */
export function VersionEntry({
  entry,
  onOpen,
}: {
  entry: Extract<TaskTimelineEntry, { kind: 'artifact_version' }>
  onOpen: () => void
}) {
  const who = entry.byAgent ? 'Written by the agent' : `Edited by ${entry.author?.name ?? 'someone'}`
  return (
    <li className="ml-[42px] flex items-center justify-between gap-3 rounded-[7px] border border-[var(--gray-5)] bg-[var(--gray-2)] px-4 py-3">
      <div>
        <p className="text-sm font-semibold text-[var(--gray-12)]">
          {ARTIFACT_NAME[entry.artifact]} v{entry.version}
        </p>
        <p className="text-xs text-[var(--gray-10)]">
          {who} · <Timestamp date={entry.at} />
        </p>
      </div>
      <Button outline onClick={onOpen} aria-label={`Open ${ARTIFACT_NAME[entry.artifact]} v${entry.version}`}>
        Open
      </Button>
    </li>
  )
}

/** Something that happened on the task, in a quiet line: someone started watching, a run was cancelled. */
export function EventEntry({
  entry,
  nameOf,
}: {
  entry: Extract<TaskTimelineEntry, { kind: 'event' }>
  nameOf: (id: string) => string
}) {
  return (
    <li className="-mt-3 ml-[42px] flex items-baseline justify-between gap-4 text-xs text-[var(--gray-10)]">
      <span>{describeActivity(entry.activity, nameOf)}</span>
      <Timestamp date={entry.at} className="shrink-0" />
    </li>
  )
}

/** A run of turns that didn't finish, as one quiet row that opens in place. */
export function FoldedAttempts({ label, latestAt, children }: { label: string; latestAt: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="ml-[42px] flex items-center gap-1 text-xs text-[var(--gray-10)] hover:text-[var(--gray-12)]"
      >
        <span aria-hidden>{open ? '▾' : '▸'}</span>
        {label} · latest <Timestamp date={latestAt} />
      </button>
      {open && <ol className="mt-6 space-y-6">{children}</ol>}
    </li>
  )
}
