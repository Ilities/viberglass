import { Theme } from '@radix-ui/themes'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ClankerActions } from './clanker-actions'
import { deactivateClanker, deleteClanker, startClanker } from '@/service/api/clanker-api'
import type { Clanker } from '@viberglass/types'

jest.mock('@/service/api/clanker-api', () => ({
  startClanker: jest.fn(),
  deactivateClanker: jest.fn(),
  deleteClanker: jest.fn(),
}))

const mockedStartClanker = startClanker as jest.MockedFunction<typeof startClanker>
const mockedDeactivateClanker = deactivateClanker as jest.MockedFunction<typeof deactivateClanker>
const mockedDeleteClanker = deleteClanker as jest.MockedFunction<typeof deleteClanker>

function buildClanker(): Clanker {
  return {
    id: '8f188171-d2f5-4936-a2f8-ceca85f2bd1f',
    name: 'ECS Worker',
    slug: 'ecs-worker',
    description: null,
    deploymentStrategyId: null,
    deploymentStrategy: null,
    deploymentConfig: null,
    configFiles: [],
    agent: 'claude-code',
    secretIds: [],
    status: 'inactive',
    statusMessage: null,
    createdAt: '2026-02-17T00:00:00.000Z',
    updatedAt: '2026-02-17T00:00:00.000Z',
  }
}

function renderActions(
  clanker: Clanker,
  onClankerUpdated?: (updatedClanker: Clanker) => void
) {
  return render(
    <Theme>
      <MemoryRouter>
        <ClankerActions clanker={clanker} onClankerUpdated={onClankerUpdated} />
      </MemoryRouter>
    </Theme>
  )
}

describe('ClankerActions', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    mockedDeactivateClanker.mockResolvedValue(buildClanker())
    mockedDeleteClanker.mockResolvedValue()
  })

  it('shows start API errors inline so configuration issues are visible', async () => {
    const clanker = buildClanker()
    mockedStartClanker.mockRejectedValue(
      new Error('ECS managed provisioning is missing required configuration: executionRoleArn')
    )

    renderActions(clanker)

    await userEvent.click(screen.getByRole('button', { name: 'Start' }))

    await waitFor(() => {
      expect(mockedStartClanker).toHaveBeenCalledWith(clanker.id)
    })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'ECS managed provisioning is missing required configuration'
    )
  })

  it('updates local clanker state on successful start when callback is provided', async () => {
    const clanker = buildClanker()
    const updatedClanker: Clanker = {
      ...clanker,
      status: 'deploying',
      statusMessage: 'Starting clanker...',
    }
    const onClankerUpdated = jest.fn()
    mockedStartClanker.mockResolvedValue(updatedClanker)

    renderActions(clanker, onClankerUpdated)

    await userEvent.click(screen.getByRole('button', { name: 'Start' }))

    await waitFor(() => {
      expect(onClankerUpdated).toHaveBeenCalledWith(updatedClanker)
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
