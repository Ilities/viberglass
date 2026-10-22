import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ModelEndpoint } from '@viberglass/types'
import { ModelEndpointDialog } from './ModelEndpointDialog'

const mockCheck = jest.fn()
const mockSave = jest.fn()
jest.mock('@/service/api/model-endpoint-api', () => ({
  checkModelEndpoint: (...args: unknown[]) => mockCheck(...args),
  saveModelEndpoint: (...args: unknown[]) => mockSave(...args),
}))
jest.mock('@/service/api/secret-api', () => ({
  createSecret: jest.fn(),
  getSecretStorageDefaults: () => Promise.resolve({ location: 'database' }),
}))

const endpoint: ModelEndpoint = {
  id: 'endpoint-1',
  name: 'Local vLLM',
  baseUrl: 'http://localhost:8000/v1',
  apiFormat: 'openai-chat',
  auth: { scheme: 'none' },
  extraHeaders: {},
  models: ['qwen', 'llama'],
  contextWindows: { qwen: 32768 },
  mayColdStart: false,
  source: 'manual',
  deploymentId: null,
  createdAt: '',
  updatedAt: '',
}

function renderDialog(initial?: ModelEndpoint) {
  const onSaved = jest.fn()
  render(
    <Theme>
      <ModelEndpointDialog open onClose={jest.fn()} onSaved={onSaved} secrets={[]} formats={['openai-chat']} initial={initial} />
    </Theme>
  )
  return { onSaved }
}

describe('ModelEndpointDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSave.mockResolvedValue(endpoint)
  })

  it("shows each model with its context length, and saves what's edited", async () => {
    const { onSaved } = renderDialog(endpoint)
    const models = screen.getByRole('textbox', { name: 'Model IDs' })
    expect(models).toHaveValue('qwen 32768\nllama')

    fireEvent.change(models, { target: { value: 'qwen 32768\nllama 131072' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ models: ['qwen', 'llama'], contextWindows: { qwen: 32768, llama: 131072 } }),
      'endpoint-1'
    )
  })

  it('fills in the context lengths the endpoint reports when checked', async () => {
    mockCheck.mockResolvedValue({ models: ['qwen', 'llama'], contextWindows: { llama: 131072 }, discoverySupported: true })
    renderDialog(endpoint)

    fireEvent.click(screen.getByRole('button', { name: 'Check connection and discover models' }))

    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Model IDs' })).toHaveValue('qwen\nllama 131072'))
  })
})
