import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { AppDataBackup, ClawScheduleSummary, ClawTaskTemplateSummary } from '@viberglass/types'
import { getAppBackups } from '@/service/api/app-api'
import { createClawSchedule, getClawSchedules, getClawTaskTemplates, pauseClawSchedule } from '@/service/api/claw-api'
import { SchedulesTab } from './schedules-tab'

jest.mock('@/service/api/app-api', () => ({ getAppBackups: jest.fn(async () => []) }))

jest.mock('@/service/api/claw-api', () => ({
  getClawSchedules: jest.fn(),
  getClawTaskTemplates: jest.fn(),
  getClawTaskTemplate: jest.fn(),
  createClawSchedule: jest.fn(),
  updateClawSchedule: jest.fn(),
  deleteClawSchedule: jest.fn(),
  pauseClawSchedule: jest.fn(async () => ({})),
  resumeClawSchedule: jest.fn(async () => ({})),
}))

const TEMPLATE: ClawTaskTemplateSummary = {
  id: 'tmpl-1',
  projectId: 'space-1',
  name: 'Feedback summary',
  description: null,
  clankerId: 'a-1',
  secretBindings: [],
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
}

function schedule(id: string, name: string, isActive: boolean, action: ClawScheduleSummary['action'] = 'run_template'): ClawScheduleSummary {
  return {
    id,
    projectId: 'space-1',
    action,
    taskTemplateId: action === 'run_template' ? 'tmpl-1' : null,
    backupId: action === 'app_restore_data' ? 'backup-1' : null,
    name,
    description: null,
    scheduleType: 'interval',
    intervalExpression: '1w',
    cronExpression: null,
    timezone: 'UTC',
    isActive,
    lastRunAt: null,
    nextRunAt: null,
    runCount: 0,
    failureCount: 0,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  }
}

const BACKUPS: AppDataBackup[] = [
  { id: 'backup-1', reason: 'manual', takenAt: '2026-11-09T09:00:00.000Z', fromRelease: { id: 'r-1', commitSha: 'abcdef1'.padEnd(40, '0') }, bytes: 4096 },
  { id: 'backup-2', reason: 'release', takenAt: '2026-11-08T09:00:00.000Z', fromRelease: null, bytes: 2048 },
]

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: jest.fn() })
})

describe('SchedulesTab', () => {
  it('names the action and the schedule on each row button', async () => {
    jest.mocked(getClawTaskTemplates).mockResolvedValue([TEMPLATE])
    jest.mocked(getClawSchedules).mockResolvedValue([
      schedule('s-1', 'Monday feedback summary', true),
      schedule('s-2', 'Nightly audit', false),
    ])
    render(
      <Theme>
        <SchedulesTab projectId="space-1" onCreateTemplate={() => {}} />
      </Theme>
    )

    expect(await screen.findByRole('button', { name: 'Pause Monday feedback summary' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit Monday feedback summary' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete Monday feedback summary' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resume Nightly audit' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Pause Monday feedback summary' }))
    expect(await screen.findByRole('button', { name: 'Resume Monday feedback summary' })).toBeInTheDocument()
    expect(pauseClawSchedule).toHaveBeenCalledWith('s-1')
  })

  it("lets an App space's maintainer turn the app off on a schedule, without a template", async () => {
    jest.mocked(getClawTaskTemplates).mockResolvedValue([])
    jest.mocked(getClawSchedules).mockResolvedValue([])
    jest.mocked(createClawSchedule).mockResolvedValue({} as never)
    render(
      <Theme>
        <SchedulesTab projectId="space-1" onCreateTemplate={() => {}} appActions />
      </Theme>
    )

    fireEvent.click(await screen.findByRole('button', { name: 'New schedule' }))
    expect(screen.queryByText('Task template')).not.toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('Nightly health check'), { target: { value: 'Off at night' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create schedule' }))

    await waitFor(() =>
      expect(createClawSchedule).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'space-1', name: 'Off at night', action: 'app_stop' }))
    )
    expect(jest.mocked(createClawSchedule).mock.calls[0][0]).not.toHaveProperty('taskTemplateId')
  })

  it("shows an app schedule to someone who isn't a maintainer, without its controls", async () => {
    jest.mocked(getClawTaskTemplates).mockResolvedValue([TEMPLATE])
    jest.mocked(getClawSchedules).mockResolvedValue([schedule('s-1', 'Off at night', true, 'app_stop')])
    render(
      <Theme>
        <SchedulesTab projectId="space-1" onCreateTemplate={() => {}} />
      </Theme>
    )

    expect(await screen.findByText('Turn the app off')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pause Off at night' })).not.toBeInTheDocument()
  })

  it("lets an App space's maintainer restore the app's data from a backup on a schedule", async () => {
    jest.mocked(getClawTaskTemplates).mockResolvedValue([])
    jest.mocked(getClawSchedules).mockResolvedValue([])
    jest.mocked(getAppBackups).mockResolvedValue(BACKUPS)
    jest.mocked(createClawSchedule)
      .mockClear()
      .mockResolvedValue({ ...schedule('s-9', 'Reset the demo', true, 'app_restore_data'), webhookConfig: null, createdBy: null })
    render(
      <Theme>
        <SchedulesTab projectId="space-1" onCreateTemplate={() => {}} appActions />
      </Theme>
    )

    fireEvent.click(await screen.findByRole('button', { name: 'New schedule' }))
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'What it does' }), { key: 'ArrowDown' })
    fireEvent.click(await screen.findByRole('option', { name: 'Restore app data' }))
    const picker = await screen.findByRole('combobox', { name: 'Backup' })
    expect(picker).toHaveTextContent('release abcdef1 · backed up by hand')
    fireEvent.keyDown(picker, { key: 'ArrowDown' })
    fireEvent.click(await screen.findByRole('option', { name: /before a new release went live/ }))
    fireEvent.change(screen.getByPlaceholderText('Nightly health check'), { target: { value: 'Reset the demo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create schedule' }))

    await waitFor(() =>
      expect(createClawSchedule).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Reset the demo', action: 'app_restore_data', backupId: 'backup-2' })
      )
    )
  })

  it('shows a restore schedule with its backup to someone who can only view it', async () => {
    jest.mocked(getClawTaskTemplates).mockResolvedValue([])
    jest.mocked(getClawSchedules).mockResolvedValue([schedule('s-1', 'Reset the demo', true, 'app_restore_data')])
    jest.mocked(getAppBackups).mockResolvedValue(BACKUPS)
    render(
      <Theme>
        <SchedulesTab projectId="space-1" onCreateTemplate={() => {}} readOnly />
      </Theme>
    )

    expect(await screen.findByText(/^Restore app data from .*backed up by hand$/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit Reset the demo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New schedule' })).not.toBeInTheDocument()
  })
})
