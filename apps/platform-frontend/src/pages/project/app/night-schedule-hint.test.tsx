import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createClawSchedule, getClawSchedules } from '@/service/api/claw-api'
import { NightScheduleHint } from './night-schedule-hint'

jest.mock('@/service/api/claw-api', () => ({
  getClawSchedules: jest.fn(),
  createClawSchedule: jest.fn(),
}))

function renderHint() {
  return render(
    <Theme>
      <NightScheduleHint projectId="space-1" />
    </Theme>
  )
}

describe('NightScheduleHint', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
    jest.mocked(getClawSchedules).mockResolvedValue([])
    jest.mocked(createClawSchedule).mockResolvedValue({} as never)
  })

  it('adds a schedule that turns the app off at night and one that turns it on in the morning', async () => {
    renderHint()

    fireEvent.click(await screen.findByRole('button', { name: 'Add the schedules' }))

    await waitFor(() => expect(createClawSchedule).toHaveBeenCalledTimes(2))
    expect(createClawSchedule).toHaveBeenCalledWith(expect.objectContaining({ action: 'app_stop', cronExpression: '0 0 22 * * *' }))
    expect(createClawSchedule).toHaveBeenCalledWith(expect.objectContaining({ action: 'app_start', cronExpression: '0 0 7 * * *' }))
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  })

  it('stays away once dismissed', async () => {
    const { unmount } = renderHint()
    fireEvent.click(await screen.findByRole('button', { name: 'Not now' }))
    unmount()

    renderHint()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(getClawSchedules).toHaveBeenCalledTimes(1)
  })

  it('says nothing when the app already turns off on a schedule', async () => {
    jest.mocked(getClawSchedules).mockResolvedValue([{ action: 'app_stop' } as never])
    renderHint()
    await waitFor(() => expect(getClawSchedules).toHaveBeenCalled())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
