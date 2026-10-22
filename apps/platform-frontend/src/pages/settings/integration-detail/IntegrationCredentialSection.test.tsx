import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { IntegrationCredential } from '@viberglass/types'
import { deleteIntegrationCredential, getIntegrationCredentials } from '@/service/api/integration-api'
import { IntegrationCredentialSection } from './IntegrationCredentialSection'

jest.mock('@/service/api/integration-api', () => ({
  getIntegrationCredentials: jest.fn(),
  createIntegrationCredential: jest.fn(),
  updateIntegrationCredential: jest.fn(),
  deleteIntegrationCredential: jest.fn(),
}))
jest.mock('@/service/api/secret-api', () => ({
  listAllSecrets: jest.fn(() => Promise.resolve([])),
  getSecretStorageDefaults: jest.fn(() => Promise.resolve({ location: 'database', ssmPrefix: '/viberator/secrets' })),
}))

const CREDENTIAL: IntegrationCredential = {
  id: 'cred-1',
  integrationId: 'conn-1',
  name: 'GITHUB_TOKEN',
  credentialType: 'token',
  secretId: 'secret-1',
  secretLocation: 'database',
  isDefault: true,
  description: null,
  expiresAt: null,
  lastUsedAt: null,
  createdAt: '2026-09-30T10:00:00.000Z',
  updatedAt: '2026-09-30T10:00:00.000Z',
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getIntegrationCredentials).mockResolvedValue([CREDENTIAL])
  jest.mocked(deleteIntegrationCredential).mockResolvedValue(undefined as unknown as void)
})

describe('IntegrationCredentialSection', () => {
  it('asks before deleting a credential', async () => {
    render(
      <Theme>
        <IntegrationCredentialSection integrationId="conn-1" credentialUse="pushes commits" />
      </Theme>
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Delete credential' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('GITHUB_TOKEN')
    expect(deleteIntegrationCredential).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(deleteIntegrationCredential).toHaveBeenCalledWith('conn-1', 'cred-1'))
  })

  it('keeps the credential when the deletion is cancelled', async () => {
    render(
      <Theme>
        <IntegrationCredentialSection integrationId="conn-1" credentialUse="pushes commits" />
      </Theme>
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Delete credential' }))

    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(deleteIntegrationCredential).not.toHaveBeenCalled()
  })
})
