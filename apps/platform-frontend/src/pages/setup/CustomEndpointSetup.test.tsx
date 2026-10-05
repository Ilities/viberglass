import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CustomEndpointSetup } from './CustomEndpointSetup'

const mockCheck = jest.fn()
const mockSave = jest.fn()
const mockCreateSecret = jest.fn()
jest.mock('@/service/api/model-endpoint-api', () => ({
  checkModelEndpoint: (...args: unknown[]) => mockCheck(...args),
  saveModelEndpoint: (...args: unknown[]) => mockSave(...args),
}))
jest.mock('@/service/api/secret-api', () => ({
  createSecret: (...args: unknown[]) => mockCreateSecret(...args),
  getSecretStorageDefaults: () => Promise.resolve({ location: 'database' }),
}))

function renderSetup() {
  const onDone = jest.fn()
  render(
    <Theme>
      <CustomEndpointSetup onDone={onDone} />
    </Theme>
  )
  fireEvent.change(screen.getByLabelText('API base URL'), { target: { value: 'https://api.z.ai/api/paas/v4' } })
  fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'zai-key' } })
  return { onDone }
}

describe('CustomEndpointSetup', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCreateSecret.mockResolvedValue({ id: 'secret-1' })
    mockCheck.mockResolvedValue({ models: ['glm-4.7-flash', 'glm-4.7'], discoverySupported: true })
    mockSave.mockResolvedValue({ id: 'endpoint-1' })
  })

  it('says which agent runs the endpoint, and that the others keep their own providers', () => {
    renderSetup()
    expect(screen.getByText(/Agents run it on OpenCode/)).toBeInTheDocument()
  })

  it("stores the key as the endpoint's own, checks the endpoint, and goes on with the chosen model", async () => {
    const { onDone } = renderSetup()

    fireEvent.click(screen.getByRole('button', { name: 'Find models' }))
    await waitFor(() => expect(screen.getByLabelText('Model')).toHaveValue('glm-4.7-flash'))
    fireEvent.click(screen.getByRole('button', { name: 'Check and continue' }))

    await waitFor(() => expect(onDone).toHaveBeenCalledWith('endpoint-1', 'glm-4.7-flash'))
    // One key stored, though the endpoint was checked twice.
    expect(mockCreateSecret).toHaveBeenCalledTimes(1)
    expect(mockCreateSecret).toHaveBeenCalledWith({ name: 'api.z.ai key', secretLocation: 'database', secretValue: 'zai-key' })
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'https://api.z.ai/api/paas/v4', apiFormat: 'openai-chat', secretId: 'secret-1', models: ['glm-4.7-flash', 'glm-4.7'] })
    )
  })

  it("refuses a model the endpoint doesn't list, naming what it does", async () => {
    const { onDone } = renderSetup()
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'gpt-5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Check and continue' }))

    expect(await screen.findByText("This endpoint doesn't list gpt-5. It lists glm-4.7-flash, glm-4.7.")).toBeInTheDocument()
    expect(onDone).not.toHaveBeenCalled()
  })
})
