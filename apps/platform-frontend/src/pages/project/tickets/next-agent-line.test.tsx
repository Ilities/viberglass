import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Clanker } from '@viberglass/types'
import { NextAgentLine } from './next-agent-line'

const mockNextAgent = jest.fn()
let mockRole = 'member'
jest.mock('@/context/auth-context', () => ({ useAuth: () => ({ user: { id: 'me', role: mockRole } }) }))
jest.mock('@/service/api/discussion-api', () => ({ getNextAgent: (...args: unknown[]) => mockNextAgent(...args) }))

function runner(overrides: Partial<Clanker> = {}): Clanker {
  return {
    id: 'c-1',
    name: 'Claude review',
    slug: 'claude',
    deploymentStrategyId: 'docker',
    deploymentConfig: { version: 1, strategy: { type: 'docker' }, agent: { type: 'opencode', model: 'zai/glm-4.7-flash' } },
    configFiles: [],
    agent: 'opencode',
    secretBindings: [],
    mcpServerIds: [],
    skillIds: [],
    status: 'active',
    readiness: { state: 'ready', problem: null, lastRun: null },
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

function renderLine(clankers: Clanker[], onTask: string[] = []) {
  render(
    <MemoryRouter>
      <NextAgentLine taskId="t-1" refreshKey="1" clankers={clankers} agentsOnTask={new Set(onTask)} />
    </MemoryRouter>
  )
}

const STOPPED = runner({ status: 'inactive', readiness: { state: 'not_running', problem: 'Not started. An admin can start it.', lastRun: null } })

describe('NextAgentLine', () => {
  beforeEach(() => {
    mockRole = 'member'
  })

  it('names the agent an ask goes to, with its harness and model in a tooltip', async () => {
    mockNextAgent.mockResolvedValue({ clankerId: 'c-1', name: 'Claude review', via: 'default', problem: null })
    renderLine([runner()])

    const line = await screen.findByRole('status', { name: 'Agent for the next ask' })
    expect(line).toHaveTextContent("Asks go to Claude review, the workspace's default agent.")
    expect(line).not.toHaveTextContent('zai/glm-4.7-flash')
    expect(screen.getByText('Claude review')).toHaveAttribute('title', expect.stringContaining('model zai/glm-4.7-flash'))
    expect(screen.getByText('Claude review')).toHaveAttribute('title', expect.stringContaining('Starts fresh'))
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('offers an admin to start an agent that is not running', async () => {
    mockRole = 'admin'
    mockNextAgent.mockResolvedValue({ clankerId: 'c-1', name: 'Claude review', via: 'on_task', problem: 'Not started. An admin can start it.' })
    renderLine([STOPPED], ['c-1'])

    const line = await screen.findByRole('status', { name: 'Agent for the next ask' })
    expect(line).toHaveTextContent('Not running')
    expect(screen.getByRole('button', { name: /Start/ })).toBeInTheDocument()
    expect(line).not.toHaveTextContent(/admin/i)
    expect(screen.getByText('Claude review')).toHaveAttribute('title', expect.stringContaining('Picks up its conversation here'))
  })

  it('tells anyone else an admin needs to start it', async () => {
    mockNextAgent.mockResolvedValue({ clankerId: 'c-1', name: 'Claude review', via: 'on_task', problem: 'Not started. An admin can start it.' })
    renderLine([STOPPED], ['c-1'])

    const line = await screen.findByRole('status', { name: 'Agent for the next ask' })
    expect(line).toHaveTextContent('An admin needs to start it.')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('sends an admin to an agent with a setup problem', async () => {
    mockRole = 'admin'
    mockNextAgent.mockResolvedValue({ clankerId: 'c-1', name: 'Claude review', via: 'on_task', problem: 'No model key.' })
    renderLine([runner({ readiness: { state: 'needs_key', problem: 'No model key.', lastRun: null } })])

    const line = await screen.findByRole('status', { name: 'Agent for the next ask' })
    expect(line).toHaveTextContent('Needs a model key')
    expect(screen.getByRole('link', { name: 'Open agent' })).toHaveAttribute('href', '/settings/agents/claude')
  })

  it('says why no agent would run', async () => {
    mockNextAgent.mockResolvedValue({ clankerId: null, name: null, via: null, problem: 'No agent is ready to run.' })
    renderLine([])

    expect(await screen.findByText('No agent is ready to run.')).toBeInTheDocument()
  })

  it("names the agent for someone who can't list agents, such as a guest", async () => {
    mockNextAgent.mockResolvedValue({ clankerId: 'c-1', name: 'Claude review', via: 'on_task', problem: null })
    renderLine([], ['c-1'])

    const line = await screen.findByRole('status', { name: 'Agent for the next ask' })
    expect(line).toHaveTextContent('Asks go to Claude review, already on this task.')
  })
})
