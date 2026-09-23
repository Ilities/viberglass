import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createIntegration, deleteIntegration } from '@/service/api/integration-api'
import { CreateIntegrationPrompt } from './CreateIntegrationPrompt'
import { RemoveIntegrationSection } from './RemoveIntegrationSection'

jest.mock('@/service/api/integration-api', () => ({
  createIntegration: jest.fn(),
  deleteIntegration: jest.fn(),
}))

const mockCreate = jest.mocked(createIntegration)
const mockDelete = jest.mocked(deleteIntegration)

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
    fireEvent.click(screen.getByRole('button', { name: /create github integration/i }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('int-1'))
    expect(mockCreate).toHaveBeenCalledWith({ name: 'Acme GitHub', system: 'github', config: {} })
  })
})

describe('RemoveIntegrationSection', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows which projects block removal', async () => {
    mockDelete.mockRejectedValue(
      new Error('This integration is used by UX Walkthrough. Remove it from that project first.'),
    )
    const onRemoved = jest.fn()
    render(
      <Theme>
        <RemoveIntegrationSection integrationId="int-1" name="Acme GitHub" onRemoved={onRemoved} />
      </Theme>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Remove integration' }))
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

    fireEvent.click(screen.getByRole('button', { name: 'Remove integration' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(onRemoved).toHaveBeenCalled())
    expect(mockDelete).toHaveBeenCalledWith('int-1')
  })
})
