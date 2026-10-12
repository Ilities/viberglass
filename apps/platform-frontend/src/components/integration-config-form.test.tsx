import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen } from '@testing-library/react'
import type { IntegrationManifest } from '@viberglass/types'
import { IntegrationConfigForm } from './integration-config-form'

const CHAT_APP: IntegrationManifest = {
  id: 'chat-app',
  label: 'Chat app',
  description: '',
  category: 'chat',
  status: 'ready',
  configFields: [
    { key: 'botToken', label: 'Bot token', type: 'secret', required: true, placeholder: 'xoxb-…' },
    { key: 'signingSecret', label: 'Signing secret', type: 'secret', required: true },
  ],
}

function renderForm(storedSecrets: string[], onSubmit = jest.fn()) {
  render(
    <Theme>
      <IntegrationConfigForm integration={CHAT_APP} storedSecrets={storedSecrets} onSubmit={onSubmit} onCancel={jest.fn()} />
    </Theme>
  )
  return onSubmit
}

describe('IntegrationConfigForm secret fields', () => {
  it('asks for secrets in hidden inputs, required until they are saved', () => {
    renderForm([])
    const token = screen.getByLabelText(/Bot token/)
    expect(token).toHaveAttribute('type', 'password')
    expect(token).toHaveAttribute('placeholder', 'xoxb-…')
    expect(token).toBeRequired()
  })

  it('shows a saved secret as saved, empty and optional, so saving keeps it', () => {
    renderForm(['botToken'])
    const token = screen.getByLabelText(/Bot token/)
    expect(token).toHaveValue('')
    expect(token).toHaveAttribute('placeholder', 'Saved. Enter a new value to replace it.')
    expect(token).not.toBeRequired()
    expect(screen.getByLabelText(/Signing secret/)).toBeRequired()
  })

  it('submits the values entered', () => {
    const onSubmit = renderForm(['botToken', 'signingSecret'])
    fireEvent.change(screen.getByLabelText(/Signing secret/), { target: { value: 'new-secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Configuration' }))
    expect(onSubmit).toHaveBeenCalledWith({ signingSecret: 'new-secret' })
  })
})
