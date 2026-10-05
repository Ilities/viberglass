import { render, screen } from '@testing-library/react'
import type { Clanker } from '@viberglass/types'
import { NextAgentLine } from './next-agent-line'

const mockNextAgent = jest.fn()
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

describe('NextAgentLine', () => {
  it('names the agent an ask goes to, its model as configured, and whether it starts fresh', async () => {
    mockNextAgent.mockResolvedValue({ clankerId: 'c-1', name: 'Claude review', via: 'default', problem: null })
    render(<NextAgentLine taskId="t-1" refreshKey="1" clankers={[runner()]} agentsOnTask={new Set()} />)

    const line = await screen.findByRole('status', { name: 'Agent for the next ask' })
    expect(line).toHaveTextContent("Asks go to Claude review, the workspace's default agent.")
    expect(line).toHaveTextContent('model zai/glm-4.7-flash as configured')
    expect(line).toHaveTextContent('It starts fresh')
  })

  it('says when the agent picks up its conversation, and when it is not ready', async () => {
    mockNextAgent.mockResolvedValue({ clankerId: 'c-1', name: 'Claude review', via: 'on_task', problem: 'No model key.' })
    const keyless = runner({ readiness: { state: 'needs_key', problem: 'No model key.', lastRun: null } })
    render(<NextAgentLine taskId="t-1" refreshKey="1" clankers={[keyless]} agentsOnTask={new Set(['c-1'])} />)

    const line = await screen.findByRole('status', { name: 'Agent for the next ask' })
    expect(line).toHaveTextContent('It picks up its conversation here')
    expect(line).toHaveTextContent('Needs a model key')
    expect(line).toHaveTextContent('No model key.')
  })

  it('says why no agent would run', async () => {
    mockNextAgent.mockResolvedValue({ clankerId: null, name: null, via: null, problem: 'No agent is ready to run.' })
    render(<NextAgentLine taskId="t-1" refreshKey="1" clankers={[]} agentsOnTask={new Set()} />)

    expect(await screen.findByText('No agent is ready to run.')).toBeInTheDocument()
  })

  it("names the agent for someone who can't list runners, such as a guest", async () => {
    mockNextAgent.mockResolvedValue({ clankerId: 'c-1', name: 'Claude review', via: 'on_task', problem: null })
    render(<NextAgentLine taskId="t-1" refreshKey="1" clankers={[]} agentsOnTask={new Set(['c-1'])} />)

    const line = await screen.findByRole('status', { name: 'Agent for the next ask' })
    expect(line).toHaveTextContent('Asks go to Claude review, already on this task.')
    expect(line).toHaveTextContent('It picks up its conversation here')
  })
})
