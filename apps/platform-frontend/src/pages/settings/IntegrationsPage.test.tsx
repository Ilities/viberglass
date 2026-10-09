import { Theme } from '@radix-ui/themes'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { IntegrationFrontendRegistry } from '@viberglass/integration-core/frontend'
import type { IntegrationCategory } from '@viberglass/types'
import { getChatStatus, getIntegrationSettingsListItems, type IntegrationSettingsListItem } from '@/service/api/integration-api'
import { IntegrationsPage } from './IntegrationsPage'

jest.mock('@/service/api/integration-api', () => ({
  getChatStatus: jest.fn(),
  getIntegrationSettingsListItems: jest.fn(),
}))

const mockRegistry = new IntegrationFrontendRegistry()
jest.mock('@/integrations/registerFrontendIntegrationPlugins', () => ({
  get integrationFrontendRegistry() {
    return mockRegistry
  },
}))

function item(system: string, category: IntegrationCategory): IntegrationSettingsListItem {
  return {
    id: system,
    system,
    label: `${system} label`,
    description: '',
    category,
    status: 'ready',
    authTypes: [],
    configFields: [],
    supports: { issues: false },
    configStatus: 'not_configured',
    instances: [],
  }
}

function section(heading: string): HTMLElement {
  const element = screen.getByRole('heading', { name: heading }).closest('section')
  if (!element) throw new Error(`No section for ${heading}`)
  return element
}

describe('IntegrationsPage', () => {
  it('counts a chat integration as in use once its bot is set up, and asks only chat integrations', async () => {
    jest
      .mocked(getIntegrationSettingsListItems)
      .mockResolvedValue([item('chat-a', 'chat'), item('chat-b', 'chat'), item('tracker', 'ticketing')])
    jest.mocked(getChatStatus).mockImplementation(async (system) => ({ configured: system === 'chat-a' }))

    render(
      <Theme>
        <MemoryRouter>
          <IntegrationsPage />
        </MemoryRouter>
      </Theme>
    )

    await waitFor(() => expect(within(section('In use')).getByText('chat-a label')).toBeInTheDocument())
    expect(within(section('Available')).getByText('chat-b label')).toBeInTheDocument()
    expect(within(section('Available')).getByText('tracker label')).toBeInTheDocument()
    expect(getChatStatus).toHaveBeenCalledTimes(2)
    expect(getChatStatus).toHaveBeenCalledWith('chat-a')
    expect(getChatStatus).toHaveBeenCalledWith('chat-b')
  })
})
