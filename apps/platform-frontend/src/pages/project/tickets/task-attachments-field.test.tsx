import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { TaskAttachmentsField, type TaskAttachments } from './task-attachments-field'

beforeAll(() => {
  Object.assign(URL, { createObjectURL: jest.fn(() => 'blob:preview'), revokeObjectURL: jest.fn() })
})

function Harness({ onChange }: { onChange: (value: TaskAttachments) => void }) {
  const [value, setValue] = useState<TaskAttachments>({ screenshot: null, recording: null })
  return (
    <Theme>
      <TaskAttachmentsField
        value={value}
        onChange={(next) => {
          setValue(next)
          onChange(next)
        }}
      />
    </Theme>
  )
}

describe('TaskAttachmentsField', () => {
  it('sorts one pick into the screenshot and the recording, and removes each on its own', () => {
    const onChange = jest.fn()
    render(<Harness onChange={onChange} />)
    const image = new File(['png'], 'cart.png', { type: 'image/png' })
    const video = new File(['mp4'], 'checkout.mp4', { type: 'video/mp4' })

    fireEvent.change(screen.getByLabelText('Attachments'), { target: { files: [image, video] } })

    expect(onChange).toHaveBeenLastCalledWith({ screenshot: image, recording: video })
    expect(screen.getByText('cart.png')).toBeInTheDocument()
    expect(screen.getByText('checkout.mp4')).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0])
    expect(onChange).toHaveBeenLastCalledWith({ screenshot: null, recording: video })
  })
})
