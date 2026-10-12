import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen } from '@testing-library/react'
import type { AgentSettingField } from '@viberglass/types'
import { AgentSettingFields } from './agentSettingFields'

const model: AgentSettingField = {
  key: 'model',
  label: 'Model',
  type: 'string',
  description: 'As `provider/model`.',
  placeholder: 'provider/model-name',
  env: ['MODEL'],
}

const endpoint: AgentSettingField = {
  key: 'endpoint',
  label: 'Endpoint',
  type: 'select',
  options: [{ value: 'https://eu.example.com/v1', label: 'Europe' }],
  allowCustom: true,
  env: ['ENDPOINT'],
}

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: jest.fn() })
})

function renderFields(values: Record<string, string>, onChange = jest.fn()) {
  render(
    <Theme>
      <AgentSettingFields fields={[model, endpoint]} values={values} onChange={onChange} />
    </Theme>,
  )
  return onChange
}

test('edits a text setting by its key', () => {
  const onChange = renderFields({ model: 'a/b' })

  expect(screen.getByText('provider/model').tagName).toBe('CODE')
  fireEvent.change(screen.getByDisplayValue('a/b'), { target: { value: 'c/d' } })
  expect(onChange).toHaveBeenCalledWith({ model: 'c/d' })
})

test('a list setting offers its options, and a free-text input for a custom value', async () => {
  const onChange = renderFields({ endpoint: 'https://mine.example.com/v1' })

  expect(screen.getByDisplayValue('https://mine.example.com/v1')).toBeInTheDocument()
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Endpoint' }), { key: 'ArrowDown' })
  fireEvent.click(await screen.findByRole('option', { name: 'Europe' }))
  expect(onChange).toHaveBeenCalledWith({ endpoint: 'https://eu.example.com/v1' })
})
