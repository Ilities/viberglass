import { backUpApp } from '@/service/api/app-api'
import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { AppView } from '@viberglass/types'
import { BackUpButton } from './back-up-button'

jest.mock('@/service/api/app-api', () => ({ backUpApp: jest.fn() }))

const APP: AppView = {
  power: 'on',
  state: 'running',
  statusMessage: null,
  currentRelease: null,
  releases: [],
  tasks: {},
  previews: [],
  dataPoints: {},
  rollback: null,
  backupDue: false,
  dataRestoreDue: false,
  url: null,
}

describe('BackUpButton', () => {
  it('backs the data up once the maintainer confirms the app stops for a moment', async () => {
    jest.mocked(backUpApp).mockResolvedValue({ ...APP, backupDue: true })
    const onStarted = jest.fn()
    render(
      <Theme>
        <BackUpButton projectId="space-1" app={APP} onStarted={onStarted} />
      </Theme>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Back up now' }))
    expect(await screen.findByText(/The app stops for a moment while its data is copied/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back up' }))

    await waitFor(() => expect(onStarted).toHaveBeenCalledWith({ ...APP, backupDue: true }))
    expect(backUpApp).toHaveBeenCalledWith('space-1')
  })

  it('waits while a backup is already under way', () => {
    render(
      <Theme>
        <BackUpButton projectId="space-1" app={{ ...APP, backupDue: true }} onStarted={jest.fn()} />
      </Theme>
    )

    expect(screen.getByRole('button', { name: 'Back up now' })).toBeDisabled()
  })
})
