import { DemoInstanceProvider } from '@/context/demo-instance-context'
import { getSetupStatus } from '@/service/api/auth-api'
import { Theme } from '@radix-ui/themes'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DemoInstanceBanner } from './demo-instance-banner'

jest.mock('@/service/api/auth-api', () => ({ getSetupStatus: jest.fn() }))

function renderBanner() {
  return render(
    <Theme>
      <MemoryRouter>
        <DemoInstanceProvider>
          <DemoInstanceBanner />
        </DemoInstanceProvider>
      </MemoryRouter>
    </Theme>
  )
}

describe('DemoInstanceBanner', () => {
  it('says the instance is a read-only demo that resets nightly, with the source and install guide', async () => {
    jest.mocked(getSetupStatus).mockResolvedValue({ requiresInitialUser: false, demoInstance: true })
    renderBanner()

    expect(await screen.findByText('This is a read-only demo of Viberglass. It resets every night.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Source on GitHub' })).toHaveAttribute('href', 'https://github.com/Ilities/viberglass')
    expect(screen.getByRole('link', { name: 'Install your own' })).toHaveAttribute(
      'href',
      'https://github.com/Ilities/viberglass/blob/main/docs/guide/admin/install-docker.md'
    )
  })

  it('shows nothing on an ordinary instance', async () => {
    jest.mocked(getSetupStatus).mockResolvedValue({ requiresInitialUser: false, demoInstance: false })
    renderBanner()

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(getSetupStatus).toHaveBeenCalled()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })
})
