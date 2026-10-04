import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ModelEndpoint } from '@viberglass/types'
import { useState } from 'react'
import { DEFAULT_CLANKER_CONFIG_FORM_STATE } from '../config/types'
import { ModelSection } from './ModelSection'

const endpoint: ModelEndpoint = {
  id: 'endpoint-1',
  name: 'EU models',
  baseUrl: 'https://models.example.com/v1',
  apiFormat: 'openai-chat',
  auth: { scheme: 'none' },
  extraHeaders: {},
  models: ['qwen'],
  mayColdStart: false,
  source: 'manual',
  deploymentId: null,
  createdAt: '',
  updatedAt: '',
}

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: jest.fn() })
})

test('provider and endpoint groups contain selectable Radix items', async () => {
  const onProviderChange = jest.fn()
  const onEndpointChange = jest.fn()
  render(
    <Theme>
      <ModelSection
        agent="opencode"
        provider=""
        modelKeyId=""
        secrets={[]}
        settings={DEFAULT_CLANKER_CONFIG_FORM_STATE}
        endpoints={[endpoint]}
        endpointSelection={null}
        onProviderChange={onProviderChange}
        onEndpointChange={onEndpointChange}
        onEndpointModelChange={jest.fn()}
        onEndpointSaved={jest.fn()}
        onModelKeyChange={jest.fn()}
        onSettingsChange={jest.fn()}
        onKeyAdded={jest.fn()}
      />
    </Theme>
  )

  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Provider' }), { key: 'ArrowDown' })
  fireEvent.click(await screen.findByRole('option', { name: 'EU models' }))
  expect(onEndpointChange).toHaveBeenCalledWith(endpoint.id)
  expect(onProviderChange).not.toHaveBeenCalled()

  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Provider' }), { key: 'ArrowDown' })
  fireEvent.click(await screen.findByRole('option', { name: 'OpenRouter' }))
  expect(onProviderChange).toHaveBeenCalledWith('openrouter')
})

test('a selected endpoint offers its model list and replaces the built-in model fields', () => {
  render(
    <Theme>
      <ModelSection
        agent="opencode"
        provider=""
        modelKeyId=""
        secrets={[]}
        settings={DEFAULT_CLANKER_CONFIG_FORM_STATE}
        endpoints={[endpoint]}
        endpointSelection={{ endpointId: endpoint.id, model: 'qwen' }}
        onProviderChange={jest.fn()}
        onEndpointChange={jest.fn()}
        onEndpointModelChange={jest.fn()}
        onEndpointSaved={jest.fn()}
        onModelKeyChange={jest.fn()}
        onSettingsChange={jest.fn()}
        onKeyAdded={jest.fn()}
      />
    </Theme>
  )
  expect(screen.getByRole('combobox', { name: 'Model' })).toHaveTextContent('qwen')
  expect(screen.queryByRole('textbox', { name: 'OpenCode Model' })).not.toBeInTheDocument()
})

test('an existing endpoint selection survives loading the endpoint list', async () => {
  function ExistingRunner({ endpoints }: { endpoints: ModelEndpoint[] }) {
    const [selection, setSelection] = useState<{ endpointId: string; model: string } | null>({
      endpointId: endpoint.id,
      model: 'qwen',
    })
    return (
      <Theme>
        <ModelSection
          agent="opencode"
          provider=""
          modelKeyId=""
          secrets={[]}
          settings={DEFAULT_CLANKER_CONFIG_FORM_STATE}
          endpoints={endpoints}
          endpointSelection={selection}
          onProviderChange={() => setSelection(null)}
          onEndpointChange={jest.fn()}
          onEndpointModelChange={setSelection}
          onEndpointSaved={jest.fn()}
          onModelKeyChange={jest.fn()}
          onSettingsChange={jest.fn()}
          onKeyAdded={jest.fn()}
        />
      </Theme>
    )
  }
  const { rerender } = render(<ExistingRunner endpoints={[]} />)
  expect(screen.queryByRole('textbox', { name: 'OpenCode Model' })).not.toBeInTheDocument()
  rerender(<ExistingRunner endpoints={[endpoint]} />)
  expect(await screen.findByRole('combobox', { name: 'Model' })).toHaveTextContent('qwen')
  expect(screen.getByRole('combobox', { name: 'Provider' })).toHaveTextContent('EU models')
})
