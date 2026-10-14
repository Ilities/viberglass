import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ClawScheduleSummary, ClawTaskTemplateSummary } from '@viberglass/types'
import { getClawSchedules, getClawTaskTemplates, pauseClawSchedule } from '@/service/api/claw-api'
import { SchedulesTab } from './schedules-tab'

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

function schedule(id: string, name: string, isActive: boolean): ClawScheduleSummary {
  return {
    id,
    projectId: 'space-1',
    taskTemplateId: 'tmpl-1',
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
})
