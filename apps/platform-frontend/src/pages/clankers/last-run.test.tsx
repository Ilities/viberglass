import { render, screen } from '@testing-library/react'
import type { RunnerLastRun } from '@viberglass/types'
import { LastRun } from './last-run'

function renderLastRun(lastRun: RunnerLastRun | null) {
  return render(<LastRun readiness={{ state: 'ready', problem: null, lastRun }} />)
}

const AT = '2026-10-04T10:00:00Z'

describe('LastRun', () => {
  it('says the agent has no run yet', () => {
    renderLastRun(null)
    expect(screen.getByText(/None yet/)).toBeInTheDocument()
  })

  it('shows how the latest run ended', () => {
    const { rerender } = renderLastRun({ status: 'completed', failureCode: null, failureTitle: null, at: AT })
    expect(screen.getByText(/Succeeded/)).toBeInTheDocument()

    rerender(<LastRun readiness={{ state: 'ready', problem: null, lastRun: { status: 'failed', failureCode: null, failureTitle: 'Model not found', at: AT } }} />)
    expect(screen.getByText(/Failed: Model not found/)).toBeInTheDocument()

    rerender(<LastRun readiness={{ state: 'ready', problem: null, lastRun: { status: 'cancelled', failureCode: null, failureTitle: null, at: AT } }} />)
    expect(screen.getByText(/Stopped before it finished/)).toBeInTheDocument()
  })
})
