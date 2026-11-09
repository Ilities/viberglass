import { Theme } from '@radix-ui/themes'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { getAgentDirectory } from '@/service/api/agent-directory-api'
import { AgentsListPage } from './AgentsListPage'

jest.mock('@/service/api/agent-directory-api', () => ({ getAgentDirectory: jest.fn() }))

describe('AgentsListPage', () => {
  it("shows each agent's harness, model and whether it can run, with nothing to change", async () => {
    jest.mocked(getAgentDirectory).mockResolvedValue([
      { id: 'a-1', name: 'Default agent', slug: 'default-agent', agent: 'claude-code', model: 'claude-sonnet', status: 'active', readiness: { state: 'ready', problem: null, lastRun: null }, deployable: true },
      { id: 'a-2', name: 'Spare', slug: 'spare', agent: null, model: null, status: 'inactive', readiness: { state: 'not_running', problem: null, lastRun: null }, deployable: true },
    ])
    render(
      <Theme>
        <MemoryRouter>
          <AgentsListPage />
        </MemoryRouter>
      </Theme>
    )

    expect(await screen.findByText('Default agent')).toBeInTheDocument()
    expect(screen.getByText('claude-sonnet')).toBeInTheDocument()
    expect(screen.getByText('Ready')).toBeInTheDocument()
    expect(screen.getByText('Default model')).toBeInTheDocument()
    expect(screen.getByText('Not running')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('shows no readiness when the list leaves it out, as on a demo instance', async () => {
    jest.mocked(getAgentDirectory).mockResolvedValue([
      { id: 'a-1', name: 'Default agent', slug: 'default-agent', agent: 'claude-code', model: 'claude-sonnet' },
    ])
    render(
      <Theme>
        <MemoryRouter>
          <AgentsListPage />
        </MemoryRouter>
      </Theme>
    )

    expect(await screen.findByText('Default agent')).toBeInTheDocument()
    expect(screen.getByText('claude-sonnet')).toBeInTheDocument()
    expect(screen.queryByText('Unknown')).not.toBeInTheDocument()
    expect(screen.queryByText('Not running')).not.toBeInTheDocument()
  })
})
