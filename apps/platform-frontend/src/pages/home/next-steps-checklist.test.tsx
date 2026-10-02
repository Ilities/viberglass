import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NextStepsChecklist } from './next-steps-checklist'

const mockNextSteps = jest.fn()
jest.mock('@/service/api/setup-api', () => ({ getSetupNextSteps: () => mockNextSteps() }))

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
    mockNextSteps.mockResolvedValue({ teamInvited: true, slackConnected: false, trackerConnected: false })
    renderChecklist()

    expect(await screen.findByRole('link', { name: 'Connect Slack' })).toHaveAttribute('href', '/settings/connections/new/slack')
    expect(screen.queryByRole('link', { name: 'Invite your team' })).not.toBeInTheDocument()
    expect(screen.getByText('Invite your team')).toBeInTheDocument()
  })

  it('hides when everything is done', async () => {
    mockNextSteps.mockResolvedValue({ teamInvited: true, slackConnected: true, trackerConnected: true })
    const { container } = renderChecklist()
    await Promise.resolve()

    expect(container.querySelector('section')).toBeNull()
  })

  it('stays dismissed', async () => {
    mockNextSteps.mockResolvedValue({ teamInvited: false, slackConnected: false, trackerConnected: false })
    renderChecklist()
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }))

    expect(screen.queryByRole('region', { name: 'Next steps' })).not.toBeInTheDocument()
    expect(localStorage.getItem('viberglass.nextStepsDismissed')).toBe('true')
  })
})
