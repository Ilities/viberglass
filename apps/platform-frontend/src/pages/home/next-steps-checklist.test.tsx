import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NextStepsChecklist } from './next-steps-checklist'

const mockNextSteps = jest.fn()
jest.mock('@/service/api/setup-api', () => ({ getSetupNextSteps: () => mockNextSteps() }))
jest.mock('@/integrations/integrationLabels', () => ({
  integrationLabel: (system: string) => (system === 'chatty' ? 'Chatty' : system),
}))

function renderChecklist() {
  return render(
    <Theme>
      <MemoryRouter>
        <NextStepsChecklist />
      </MemoryRouter>
    </Theme>
  )
}

describe('NextStepsChecklist', () => {
  beforeEach(() => localStorage.clear())

  it('links what is left and ticks what is done', async () => {
    mockNextSteps.mockResolvedValue({ teamInvited: true, chatConnected: false, chatSystem: 'chatty', trackerConnected: false })
    renderChecklist()

    expect(await screen.findByRole('link', { name: 'Connect Chatty' })).toHaveAttribute('href', '/settings/connections/new/chatty')
    expect(screen.queryByRole('link', { name: 'Invite your team' })).not.toBeInTheDocument()
    expect(screen.getByText('Invite your team')).toBeInTheDocument()
  })

  it('leaves out chat when the build has no chat integration', async () => {
    mockNextSteps.mockResolvedValue({ teamInvited: false, chatConnected: false, chatSystem: null, trackerConnected: true })
    renderChecklist()

    expect(await screen.findByRole('link', { name: 'Invite your team' })).toBeInTheDocument()
    expect(screen.queryByText(/^Connect (?!your tracker)/)).not.toBeInTheDocument()
  })

  it('hides when everything is done', async () => {
    mockNextSteps.mockResolvedValue({ teamInvited: true, chatConnected: true, chatSystem: 'chatty', trackerConnected: true })
    const { container } = renderChecklist()
    await Promise.resolve()

    expect(container.querySelector('section')).toBeNull()
  })

  it('stays dismissed', async () => {
    mockNextSteps.mockResolvedValue({ teamInvited: false, chatConnected: false, chatSystem: 'chatty', trackerConnected: false })
    renderChecklist()
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }))

    expect(screen.queryByRole('region', { name: 'Next steps' })).not.toBeInTheDocument()
    expect(localStorage.getItem('viberglass.nextStepsDismissed')).toBe('true')
  })
})
