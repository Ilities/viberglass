import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { TaskCodeBranch } from '@viberglass/types'
import { TaskTakeoverCard, checkoutCommands } from './task-takeover'

jest.mock('@/service/api/discussion-api', () => ({ handBackTask: jest.fn() }))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const writeText = jest.fn(() => Promise.resolve())

const BRANCH: TaskCodeBranch = {
  branch: 'feature/login',
  repositoryUrl: 'https://github.com/example/web.git',
  baseBranch: 'main',
  pushed: true,
  takenOver: { by: { id: 'user-1', name: 'Maria' }, at: '2026-09-30T10:00:00.000Z' },
}

beforeEach(() => {
  jest.clearAllMocks()
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})

describe('TaskTakeoverCard', () => {
  it('copies each git command on its own', async () => {
    render(
      <Theme>
        <TaskTakeoverCard taskId="t-1" branch={BRANCH} canSteer onHandedBack={jest.fn()} />
      </Theme>
    )

    const commands = checkoutCommands(BRANCH)
    expect(commands).toHaveLength(3)

    fireEvent.click(screen.getByRole('button', { name: `Copy command: ${commands[1]}` }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(commands[1]))
  })
})
