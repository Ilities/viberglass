import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { InboxItem } from '@viberglass/types'
import { InboxList } from './inbox-list'

const mockUpdate = jest.fn()
jest.mock('@/service/api/inbox-api', () => ({ updateInboxItem: (...args: unknown[]) => mockUpdate(...args) }))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const item = (overrides: Partial<InboxItem>): InboxItem => ({
  id: 'n-1',
  kind: 'review_requested',
  group: 'reviews',
  text: 'Maria asked you to review “Dark mode”',
  task: { id: 't-1', key: 'WEB-4', title: 'Dark mode', spaceSlug: 'web' },
  actor: { id: 'u-1', name: 'Maria' },
  createdAt: '2026-10-01T10:00:00Z',
  readAt: null,
  doneAt: null,
  snoozedUntil: null,
  ...overrides,
})

function renderList(items: InboxItem[], onChanged = jest.fn()) {
  render(
    <Theme>
      <MemoryRouter initialEntries={['/inbox']}>
        <Routes>
          <Route path="/inbox" element={<InboxList items={items} showingDone={false} onChanged={onChanged} />} />
          <Route path="/spaces/:space/tasks/:id" element={<p>Task page</p>} />
        </Routes>
      </MemoryRouter>
    </Theme>
  )
  return onChanged
}

describe('InboxList', () => {
  beforeEach(() => mockUpdate.mockResolvedValue(undefined))

  it('groups items as J10 does, in order', () => {
    renderList([item({ id: 'n-2', kind: 'mentioned', group: 'mentions', text: 'Dana mentioned you' }), item({})])

    const headings = screen.getAllByRole('heading').map((h) => h.textContent)
    expect(headings).toEqual(['Review requests · 1', 'Mentions · 1'])
  })

  it('clears an item marked done', async () => {
    const onChanged = renderList([item({})])

    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    await waitFor(() => expect(onChanged).toHaveBeenCalledWith('n-1'))
    expect(mockUpdate).toHaveBeenCalledWith('n-1', { done: true })
  })

  it('opens the task by its key and marks the item read', async () => {
    renderList([item({})])

    fireEvent.click(screen.getByRole('button', { name: /asked you to review/ }))

    expect(await screen.findByText('Task page')).toBeInTheDocument()
    expect(mockUpdate).toHaveBeenCalledWith('n-1', { read: true })
  })

  it('says when there is nothing left', () => {
    renderList([])
    expect(screen.getByText('You’re all caught up.')).toBeInTheDocument()
  })
})
