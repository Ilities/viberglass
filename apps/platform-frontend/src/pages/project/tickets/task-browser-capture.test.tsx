import { fireEvent, render, screen } from '@testing-library/react'
import type { TicketMetadata } from '@viberglass/types'
import { TaskBrowserCapture } from './task-browser-capture'

const CAPTURED: TicketMetadata = {
  capturedBy: 'browser-extension',
  pageUrl: 'http://localhost:5173/checkout',
  browser: { name: 'Chrome', version: '145.0.0.0' },
  os: { name: 'Macintosh', version: 'Intel Mac OS X 10_15_7' },
  screen: { width: 375, height: 740, viewportWidth: 375, viewportHeight: 740, pixelRatio: 3 },
  console: [
    { level: 'error', message: 'Payment failed', timestamp: '2026-11-11T17:00:00Z' },
    { level: 'info', message: 'Loaded the cart', timestamp: '2026-11-11T17:00:00Z' },
  ],
  errors: [],
  failedRequests: [
    { method: 'POST', url: 'http://localhost:5173/api/billing/checkout', status: 402, timestamp: '2026-11-11T17:00:00Z' },
  ],
  timestamp: '2026-11-11T17:00:00Z',
  timezone: 'Europe/Helsinki',
}

describe('TaskBrowserCapture', () => {
  it('shows the page, browser and window, with the errors folded away until asked for', () => {
    render(<TaskBrowserCapture metadata={CAPTURED} />)

    const section = screen.getByRole('region', { name: 'Captured by the browser extension' })
    expect(screen.getByRole('link', { name: 'http://localhost:5173/checkout' })).toHaveAttribute(
      'href',
      'http://localhost:5173/checkout',
    )
    expect(section).toHaveTextContent('Chrome 145.0.0.0 on Macintosh')
    expect(section).toHaveTextContent('Viewport 375 × 740 at 3x')
    expect(screen.queryByText('POST http://localhost:5173/api/billing/checkout → 402')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /1 console error, 1 failed request/ }))

    expect(screen.getByText('error: Payment failed')).toBeInTheDocument()
    expect(screen.getByText('POST http://localhost:5173/api/billing/checkout → 402')).toBeInTheDocument()
    expect(screen.queryByText(/Loaded the cart/)).not.toBeInTheDocument()
  })

  it('says so when the page had no errors', () => {
    render(<TaskBrowserCapture metadata={{ ...CAPTURED, console: [], failedRequests: [] }} />)

    expect(screen.getByText('No console errors or failed requests')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it("shows nothing for a task the extension didn't create", () => {
    const { container } = render(
      <TaskBrowserCapture metadata={{ browser: { name: 'Manual Entry', version: '1.0' }, timestamp: 't', timezone: 'UTC' }} />,
    )

    expect(container).toBeEmptyDOMElement()
  })
})
