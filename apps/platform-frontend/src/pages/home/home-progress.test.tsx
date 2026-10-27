import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { HomeThread } from '@viberglass/types'
import { HomeProgress } from './home-progress'

it('counts a task once when its requests appear in multiple attention lists', () => {
  const task: HomeThread = {
    task: { id: 't-1', key: 'WEB-1', title: 'Agent task', spaceSlug: 'web', spaceName: 'Web' },
    situation: { state: 'agent_working', label: 'Agent building', waitingOn: { kind: 'agent' }, yourMove: false, since: '2026-10-27T10:00:00Z' },
    roles: ['owner'], unread: 0, mentionsYou: false, lastMessage: null, latestActivityAt: '2026-10-27T10:00:00Z',
  }
  render(<MemoryRouter><HomeProgress threads={[task, { ...task }]} /></MemoryRouter>)
  expect(screen.getAllByRole('link', { name: 'Agent task' })).toHaveLength(1)
})
