import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { askAgent } from '@/service/api/discussion-api'
import { createTicket } from '@/service/api/ticket-api'
import { FirstTaskStep } from './FirstTaskStep'

jest.mock('@/service/api/discussion-api', () => ({ askAgent: jest.fn() }))
jest.mock('@/service/api/ticket-api', () => ({ createTicket: jest.fn() }))
const mockNavigate = jest.fn()
jest.mock('react-router-dom', () => ({ ...jest.requireActual('react-router-dom'), useNavigate: () => mockNavigate }))

function renderStep(backingKind: 'git' | 'files') {
  render(
    <Theme>
      <MemoryRouter>
        <FirstTaskStep space={{ projectId: 'p1', slug: 'slides', backingKind }} clankerId="c1" />
      </MemoryRouter>
    </Theme>
  )
}

beforeEach(() => {
  jest.mocked(createTicket).mockResolvedValue({ id: 't1', key: 'SLI-1' } as unknown as Awaited<ReturnType<typeof createTicket>>)
  jest.mocked(askAgent).mockResolvedValue(undefined as never)
})

it('starts a Files space with a file to write, asked of the agent directly', async () => {
  renderStep('files')
  expect(screen.getByRole('textbox', { name: 'Task' })).toHaveValue('Draft a one-page project brief')
  fireEvent.click(screen.getByRole('button', { name: 'Start the task' }))
  await waitFor(() =>
    expect(askAgent).toHaveBeenCalledWith('t1', { action: 'reply', body: 'Please write this in the space’s files.', agentId: 'c1' })
  )
})

it('starts a Git space by asking for a plan of the codebase', async () => {
  renderStep('git')
  expect(screen.getByRole('textbox', { name: 'Task' })).toHaveValue('Explain how this codebase is organised')
  fireEvent.click(screen.getByRole('button', { name: 'Start the task' }))
  await waitFor(() => expect(askAgent).toHaveBeenCalledWith('t1', { action: 'plan', body: 'Write the plan', agentId: 'c1' }))
})
