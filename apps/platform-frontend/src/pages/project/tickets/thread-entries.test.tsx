import { Theme } from '@radix-ui/themes'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { TaskTimelineEntry } from '@viberglass/types'
import { MessageEntry, trackerNote } from './thread-entries'

jest.mock('@/service/api/client', () => ({ apiFetch: jest.fn() }))
import { apiFetch } from '@/service/api/client'

type MessageTimelineEntry = Extract<TaskTimelineEntry, { kind: 'message' }>

function message(overrides: Partial<MessageTimelineEntry>): MessageTimelineEntry {
  return {
    kind: 'message',
    id: 'm-1',
    at: '2026-10-07T10:00:00Z',
    author: null,
    externalAuthor: null,
    body: 'Can we keep the old export too?',
    images: [],
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
  it('shows the images a message carries, loaded with the sign-in token', async () => {
    Object.assign(URL, { createObjectURL: jest.fn(() => 'blob:image'), revokeObjectURL: jest.fn() })
    jest.mocked(apiFetch).mockResolvedValue({ ok: true, blob: async () => new Blob([new Uint8Array([1])]) } as Response)
    const image = { id: 'media-1', filename: 'error.png', mimeType: 'image/png', size: 1, url: '/api/tasks/media/media-1/content', uploadedAt: '2026-10-21T10:00:00Z' }

    renderEntry(message({ body: '', images: [image] }))

    await waitFor(() => expect(screen.getByRole('img', { name: 'error.png' })).toHaveAttribute('src', 'blob:image'))
    expect(apiFetch).toHaveBeenCalledWith('/api/tasks/media/media-1/content')
  })

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
