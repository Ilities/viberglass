import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { AppSettingsView } from '@viberglass/types'
import { getAppSettings, removeAppSetting, saveAppSetting } from '@/service/api/app-api'
import { AppSettings } from './app-settings'

jest.mock('@/service/api/app-api', () => ({
  getAppSettings: jest.fn(),
  saveAppSetting: jest.fn(),
  removeAppSetting: jest.fn(),
}))

const VIEW: AppSettingsView = {
  settings: [
    { name: 'SLACK_CHANNEL', secret: false, value: '#laptops', forPreviews: true, updatedAt: '2026-11-05T12:00:00.000Z' },
    { name: 'SLACK_TOKEN', secret: true, value: null, forPreviews: true, updatedAt: '2026-11-05T12:00:00.000Z' },
  ],
  declared: [
    { name: 'SLACK_TOKEN', secret: true, description: 'Posts new laptops to Slack' },
    { name: 'STRIPE_KEY', secret: true },
  ],
  missing: ['STRIPE_KEY'],
}

function renderSettings(onLoad = jest.fn()) {
  render(
    <Theme>
      <AppSettings projectId="space-1" onLoad={onLoad} />
    </Theme>
  )
  return onLoad
}

describe('AppSettings', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    jest.mocked(getAppSettings).mockResolvedValue(VIEW)
  })

  it('shows plain values, hides secrets, and marks declared settings that are missing', async () => {
    const onLoad = renderSettings()

    expect(await screen.findByText('#laptops')).toBeInTheDocument()
    expect(screen.getByText('Secret')).toBeInTheDocument()
    expect(screen.getByText('also for previews')).toBeInTheDocument()
    expect(screen.getByText('Posts new laptops to Slack')).toBeInTheDocument()
    expect(screen.getByText('Not set')).toBeInTheDocument()
    expect(onLoad).toHaveBeenCalledWith(VIEW)
  })

  it('sets a missing secret as a secret, kept from previews unless asked', async () => {
    jest.mocked(saveAppSetting).mockResolvedValue({ ...VIEW, missing: [] })
    renderSettings()

    fireEvent.click(await screen.findByRole('button', { name: 'Set' }))
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'sk_live_1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(saveAppSetting).toHaveBeenCalledWith('space-1', 'STRIPE_KEY', { secret: true, value: 'sk_live_1', forPreviews: false })
    )
  })

  it("keeps a secret's value when it's changed without typing a new one", async () => {
    jest.mocked(saveAppSetting).mockResolvedValue(VIEW)
    renderSettings()

    await screen.findByText('#laptops')
    fireEvent.click(screen.getAllByRole('button', { name: 'Change' })[1])
    fireEvent.click(screen.getByRole('switch', { name: 'Also for previews' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(saveAppSetting).toHaveBeenCalledWith('space-1', 'SLACK_TOKEN', { secret: true, forPreviews: false }))
  })

  it('removes a setting', async () => {
    jest.mocked(removeAppSetting).mockResolvedValue(VIEW)
    renderSettings()

    await screen.findByText('#laptops')
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0])

    await waitFor(() => expect(removeAppSetting).toHaveBeenCalledWith('space-1', 'SLACK_CHANNEL'))
  })
})
