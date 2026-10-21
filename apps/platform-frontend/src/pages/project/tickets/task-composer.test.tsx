import { Theme } from '@radix-ui/themes'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useComposerDraft } from './composer-draft'
import { TaskComposer } from './task-composer'

jest.mock('@/context/auth-context', () => ({ useAuth: () => ({ user: { id: 'u-1', name: 'Maria' } }) }))
jest.mock('@/service/api/user-api', () => ({ getPeopleDirectory: jest.fn().mockResolvedValue([]) }))
jest.mock('@/service/api/discussion-api', () => ({
  MESSAGE_IMAGE_LIMIT: 4,
  postTaskMessage: jest.fn().mockResolvedValue({ messages: [], turn: null }),
  interruptAgent: jest.fn(),
}))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

import { postTaskMessage } from '@/service/api/discussion-api'
import { toast } from 'sonner'

function Composer({ agentWorking = false }: { agentWorking?: boolean }) {
  const draft = useComposerDraft()
  return <TaskComposer taskId="t-1" agents={[]} draft={draft} agentWorking={agentWorking} canInterrupt onPosted={jest.fn()} />
}

const image = (name: string) => new File([new Uint8Array([1])], name, { type: 'image/png' })

function paste(files: File[]) {
  fireEvent.paste(screen.getByRole('combobox', { name: 'Write a message' }), { clipboardData: { files } })
}

describe('TaskComposer with images', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    Object.assign(URL, { createObjectURL: jest.fn(() => 'blob:preview'), revokeObjectURL: jest.fn() })
  })

  it('sends pasted images with the message, and on their own', async () => {
    render(<Theme><Composer /></Theme>)

    paste([image('error.png')])
    expect(screen.getByRole('list', { name: 'Attached images' })).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send' })))

    expect(postTaskMessage).toHaveBeenCalledWith('t-1', '', {}, [expect.objectContaining({ name: 'error.png' })])
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Attached images' })).not.toBeInTheDocument())
  })

  it('takes an image off again', () => {
    render(<Theme><Composer /></Theme>)

    paste([image('a.png')])
    fireEvent.click(screen.getByRole('button', { name: 'Remove a.png' }))

    expect(screen.queryByRole('list', { name: 'Attached images' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })

  it('keeps up to four images, and says so', () => {
    render(<Theme><Composer /></Theme>)

    paste(['1', '2', '3', '4', '5'].map((name) => image(`${name}.png`)))

    expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(4)
    expect(toast.error).toHaveBeenCalledWith('A message can carry up to 4 images.')
  })

  it("offers only sending after the agent's turn while images are attached", () => {
    render(<Theme><Composer agentWorking /></Theme>)
    fireEvent.change(screen.getByRole('combobox', { name: 'Write a message' }), { target: { value: 'Look at this' } })
    expect(screen.getByRole('button', { name: 'Send now and interrupt' })).toBeInTheDocument()

    paste([image('a.png')])

    expect(screen.queryByRole('button', { name: 'Send now and interrupt' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send after this turn' })).toBeEnabled()
  })
})
