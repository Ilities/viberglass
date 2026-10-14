import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { Clanker, ClawTaskTemplateSummary, WorkspaceRole } from '@viberglass/types'
import { getClankers } from '@/service/api/clanker-api'
import { createClawTaskTemplate, getClawTaskTemplates } from '@/service/api/claw-api'
import { listAllSecrets } from '@/service/api/secret-api'
import { TemplatesTab } from './templates-tab'

let mockRole: WorkspaceRole = 'member'
jest.mock('@/context/auth-context', () => ({ useAuth: () => ({ user: { id: 'me', role: mockRole } }) }))
jest.mock('@/service/api/claw-api', () => ({
  getClawTaskTemplates: jest.fn(),
  getClawTaskTemplate: jest.fn(async () => ({ taskInstructions: 'Summarise feedback' })),
  createClawTaskTemplate: jest.fn(async () => ({})),
  updateClawTaskTemplate: jest.fn(async () => ({})),
  deleteClawTaskTemplate: jest.fn(),
}))
jest.mock('@/service/api/clanker-api', () => ({ getClankers: jest.fn() }))
jest.mock('@/service/api/secret-api', () => ({ listAllSecrets: jest.fn(async () => []) }))

function agent(id: string, name: string, deploymentStrategyId: string | null): Clanker {
  return {
    id,
    name,
    slug: id,
    description: null,
    deploymentStrategyId,
    deploymentStrategy: null,
    deploymentConfig: null,
    configFiles: [],
    agent: 'claude-code',
    secretBindings: [],
    mcpServerIds: [],
    skillIds: [],
    status: 'active',
    statusMessage: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  }
}

const TEMPLATE: ClawTaskTemplateSummary = {
  id: 'tmpl-1',
  projectId: 'space-1',
  name: 'Feedback summary',
  description: null,
  clankerId: 'a-1',
  secretBindings: [{ envVar: 'SURVEY_TOKEN', secretId: 'sec-1' }],
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
}

function renderTab() {
  return render(
    <Theme>
      <TemplatesTab projectId="space-1" startCreating={false} onStartedCreating={() => {}} />
    </Theme>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getClankers).mockResolvedValue([agent('a-1', 'Docker Claude', 'ds-1'), agent('a-2', 'Unplaced', null)])
  jest.mocked(getClawTaskTemplates).mockResolvedValue([TEMPLATE])
})

describe('TemplatesTab', () => {
  it("for a member, doesn't ask for the workspace's secrets and offers the agents they can run", async () => {
    mockRole = 'member'
    renderTab()

    fireEvent.click(await screen.findByRole('button', { name: 'New template' }))
    const dialog = await screen.findByRole('dialog')

    expect(listAllSecrets).not.toHaveBeenCalled()
    expect(within(dialog).getByRole('combobox')).toHaveTextContent('Docker Claude')
    expect(within(dialog).getByText('None. Only admins choose credentials.')).toBeInTheDocument()
  })

  it("lets a member save a template without sending credentials", async () => {
    mockRole = 'member'
    renderTab()

    fireEvent.click(await screen.findByRole('button', { name: 'New template' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByPlaceholderText('Daily health check'), { target: { value: 'Weekly' } })
    fireEvent.change(within(dialog).getByPlaceholderText(/What the agent should do/), { target: { value: 'Do it' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create template' }))

    await screen.findByRole('button', { name: 'New template' })
    expect(createClawTaskTemplate).toHaveBeenCalledWith(expect.not.objectContaining({ secretBindings: expect.anything() }))
    expect(createClawTaskTemplate).toHaveBeenCalledWith(expect.objectContaining({ clankerId: 'a-1', name: 'Weekly' }))
  })

  it('for an admin, loads the secrets to choose credentials from', async () => {
    mockRole = 'admin'
    renderTab()

    await screen.findByText('Feedback summary')
    expect(listAllSecrets).toHaveBeenCalled()
  })

  it('names the template on its edit and delete buttons', async () => {
    mockRole = 'member'
    renderTab()

    expect(await screen.findByRole('button', { name: 'Edit Feedback summary' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete Feedback summary' })).toBeInTheDocument()
  })
})
