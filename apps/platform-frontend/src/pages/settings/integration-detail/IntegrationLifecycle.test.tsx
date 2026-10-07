import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createIntegration, deleteIntegration, updateIntegration } from '@/service/api/integration-api'
import type { Integration } from '@viberglass/types'
import { ConnectionNameSection } from './ConnectionNameSection'
import { CreateIntegrationPrompt, defaultConnectionName } from './CreateIntegrationPrompt'
import { RemoveIntegrationSection } from './RemoveIntegrationSection'

jest.mock('@/service/api/integration-api', () => ({
  createIntegration: jest.fn(),
  deleteIntegration: jest.fn(),
  getIntegrations: jest.fn().mockResolvedValue([]),
  updateIntegration: jest.fn(),
}))

const mockCreate = jest.mocked(createIntegration)
const mockDelete = jest.mocked(deleteIntegration)
const mockUpdate = jest.mocked(updateIntegration)

describe('CreateIntegrationPrompt', () => {
  beforeEach(() => jest.clearAllMocks())

  it('creates nothing until asked, then creates with the chosen name', async () => {
    mockCreate.mockResolvedValue({
      id: 'int-1',
      name: 'Acme GitHub',
      system: 'github',
      config: {},
      isActive: true,
      createdAt: '2026-09-23T09:00:00.000Z',
      updatedAt: '2026-09-23T09:00:00.000Z',
    })
    const onCreated = jest.fn()
    render(
      <Theme>
        <CreateIntegrationPrompt label="GitHub" system="github" onCreated={onCreated} />
      </Theme>,
    )

    expect(mockCreate).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Acme GitHub' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create connection' }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('int-1'))
    expect(mockCreate).toHaveBeenCalledWith({ name: 'Acme GitHub', system: 'github', config: {} })
  })
})

describe('ConnectionNameSection', () => {
  beforeEach(() => jest.clearAllMocks())

  it('saves only the new name, and only once it changes', async () => {
    const connection: Integration = {
      id: 'int-1',
      name: 'GitHub 2026-09-22 13:48:32',
      system: 'github',
      config: { owner: 'acme' },
      isActive: true,
      createdAt: '2026-09-22T13:48:32.000Z',
      updatedAt: '2026-09-22T13:48:32.000Z',
    }
    mockUpdate.mockResolvedValue({ ...connection, name: 'GitHub' })
    const onRenamed = jest.fn()
    render(
      <Theme>
        <ConnectionNameSection integration={connection} onRenamed={onRenamed} />
      </Theme>,
    )

    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Connection name'), { target: { value: '  GitHub ' } })
    fireEvent.click(save)

    await waitFor(() => expect(onRenamed).toHaveBeenCalledWith({ ...connection, name: 'GitHub' }))
    expect(mockUpdate).toHaveBeenCalledWith('int-1', { name: 'GitHub' })
  })
})

describe('defaultConnectionName', () => {
  it("is the provider's name, numbered only when that name is taken", () => {
    expect(defaultConnectionName('GitHub', [])).toBe('GitHub')
    expect(defaultConnectionName('GitHub', ['GitHub', 'GitHub 2'])).toBe('GitHub 3')
  })
})

describe('RemoveIntegrationSection', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows which projects block removal', async () => {
    mockDelete.mockRejectedValue(
      new Error('This integration is used by UX Walkthrough. Remove it from that space first.'),
    )
    const onRemoved = jest.fn()
    render(
      <Theme>
        <RemoveIntegrationSection integrationId="int-1" name="Acme GitHub" onRemoved={onRemoved} />
      </Theme>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Remove connection' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }))

    expect(await screen.findByText(/used by UX Walkthrough/)).toBeInTheDocument()
    expect(onRemoved).not.toHaveBeenCalled()
  })

  it('removes after confirmation', async () => {
    mockDelete.mockResolvedValue(undefined)
    const onRemoved = jest.fn()
    render(
      <Theme>
        <RemoveIntegrationSection integrationId="int-1" name="Acme GitHub" onRemoved={onRemoved} />
      </Theme>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Remove connection' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(onRemoved).toHaveBeenCalled())
    expect(mockDelete).toHaveBeenCalledWith('int-1')
  })
})
