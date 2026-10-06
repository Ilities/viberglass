import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TaskFailureNotice } from './task-failure-notice'

let mockRole = 'admin'
jest.mock('@/context/auth-context', () => ({ useAuth: () => ({ user: { id: 'me', role: mockRole } }) }))

const MOVE = {
  kind: 'failed' as const,
  step: 'planning' as const,
  runId: 'job-1',
  failure: {
    code: 'AGENT_CREDENTIAL_INVALID',
    title: 'Model key rejected',
    summary: "The model provider rejected the agent's API key or login.",
    category: 'setup' as const,
    retryable: false,
    technicalDetail: 'Authentication required',
  },
}

function renderNotice() {
  render(
    <MemoryRouter>
      <TaskFailureNotice move={MOVE} project="shop" runner={{ name: 'Codex', slug: 'codex' }} />
    </MemoryRouter>
  )
}

describe('TaskFailureNotice', () => {
  it("sends an admin to the runner that failed, with what the agent reported", () => {
    mockRole = 'admin'
    renderNotice()

    expect(screen.getByText('The plan failed on Codex')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: "Check Codex's model key" })).toHaveAttribute('href', '/settings/agents/codex')
    expect(screen.getByText('Authentication required')).toBeInTheDocument()
    expect(screen.getByText(/same setup will fail the same way/)).toBeInTheDocument()
  })

  it('tells anyone else who can fix it, without technical detail', () => {
    mockRole = 'member'
    renderNotice()

    expect(screen.getByText(/A workspace admin needs to fix Codex's setup/)).toBeInTheDocument()
    expect(screen.queryByText('Authentication required')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
