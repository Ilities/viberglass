import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RequestApproval, waitingOnText } from './request-approval'

const mockRequest = jest.fn()

jest.mock('@/service/api/approval-api', () => ({
  requestStepApproval: (...args: unknown[]) => mockRequest(...args),
}))
jest.mock('@/service/api/user-api', () => ({
  getPeopleDirectory: () =>
    Promise.resolve([
      { id: 'tomi', name: 'Tomi', email: 'tomi@example.com', avatarUrl: null },
      { id: 'kaisa', name: 'Kaisa', email: 'kaisa@example.com', avatarUrl: null },
    ]),
}))

describe('waitingOnText', () => {
  it('names the people the step waits on', () => {
    expect(waitingOnText({ canApprove: false, approvers: [{ id: 'tomi', name: 'Tomi' }] })).toBe('Waiting on Tomi to approve.')
    expect(
      waitingOnText({
        canApprove: false,
        approvers: [
          { id: 'tomi', name: 'Tomi' },
          { id: 'kaisa', name: 'Kaisa' },
          { id: 'olli', name: 'Olli' },
        ],
      })
    ).toBe('Waiting on Tomi, Kaisa or Olli to approve.')
    expect(waitingOnText({ canApprove: false, approvers: [] })).toBeNull()
    expect(waitingOnText(null)).toBeNull()
  })
})

describe('RequestApproval', () => {
  beforeAll(() => {
    // Radix Select scrolls to the chosen item, which jsdom doesn't implement.
    Element.prototype.scrollIntoView = jest.fn()
  })

  it('asks the chosen person to review the step', async () => {
    mockRequest.mockResolvedValue(undefined)
    const onRequested = jest.fn()
    render(
      <Theme>
        <RequestApproval taskId="task-1" step="planning" onRequested={onRequested} />
      </Theme>
    )

    expect(screen.getByRole('button', { name: 'Ask to approve' })).toBeDisabled()
    fireEvent.click(screen.getByRole('combobox', { name: 'Request approval from' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Tomi' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ask to approve' }))

    await waitFor(() => expect(mockRequest).toHaveBeenCalledWith('task-1', 'planning', ['tomi']))
    await waitFor(() => expect(onRequested).toHaveBeenCalled())
  })
})
