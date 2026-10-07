import { Theme } from '@radix-ui/themes'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { TaskTimelineEntry } from '@viberglass/types'
import { MessageEntry, trackerNote } from './thread-entries'

type MessageTimelineEntry = Extract<TaskTimelineEntry, { kind: 'message' }>

function message(overrides: Partial<MessageTimelineEntry>): MessageTimelineEntry {
  return {
    kind: 'message',
    id: 'm-1',
    at: '2026-10-07T10:00:00Z',
    author: null,
    externalAuthor: null,
    body: 'Can we keep the old export too?',
    channel: 'thread',
    sessionId: null,
    ...overrides,
  }
}

function renderEntry(entry: MessageTimelineEntry) {
  return render(
    <Theme>
      <MemoryRouter>
        <ul>
          <MessageEntry entry={entry} />
        </ul>
      </MemoryRouter>
    </Theme>
  )
}

describe('MessageEntry', () => {
  it('names someone without an account by their tracker name, and says where they wrote', () => {
    renderEntry(message({ externalAuthor: { name: 'Pat Doe', source: 'jira' } }))

    expect(screen.getByText('Pat Doe')).toBeInTheDocument()
    expect(screen.getByText(/on Jira/)).toBeInTheDocument()
    expect(screen.queryByText('Someone')).not.toBeInTheDocument()
  })

  it('says where a member wrote when it was on a linked issue', () => {
    renderEntry(message({ author: { id: 'u-1', name: 'Maria Product' }, source: 'shortcut' }))

    expect(screen.getByText('Maria Product')).toBeInTheDocument()
    expect(screen.getByText(/on Shortcut/)).toBeInTheDocument()
  })

  it('adds nothing for a message written in Viberglass', () => {
    renderEntry(message({ author: { id: 'u-1', name: 'Maria Product' } }))

    expect(screen.queryByText(/ on /)).not.toBeInTheDocument()
  })

  it('names the trackers it knows', () => {
    expect(trackerNote('github')).toBe('on GitHub')
    expect(trackerNote(null)).toBeUndefined()
  })
})
