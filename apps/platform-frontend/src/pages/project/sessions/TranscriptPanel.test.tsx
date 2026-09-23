import type { AgentSessionEvent } from '@/service/api/session-api'
import { Theme } from '@radix-ui/themes'
import { render, screen } from '@testing-library/react'
import { TranscriptPanel } from './TranscriptPanel'

function event(sequence: number, eventType: AgentSessionEvent['eventType'], payloadJson: Record<string, unknown>) {
  return {
    id: `event-${sequence}`,
    sessionId: 'session-1',
    turnId: null,
    jobId: null,
    sequence,
    eventType,
    payloadJson,
    userId: null,
    createdAt: '2026-09-23T10:00:00.000Z',
  } satisfies AgentSessionEvent
}

describe('TranscriptPanel', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = jest.fn()
  })

  it('opens with what the person wrote and keeps the full prompt behind a disclosure', () => {
    render(
      <Theme>
        <TranscriptPanel
          events={[
            event(1, 'session_started', {}),
            event(2, 'user_message', {
              content: 'Start from the greeting function',
              fullPrompt: 'Create a research document for this ticket.\n\n<user-message>…</user-message>',
            }),
          ]}
        />
      </Theme>
    )

    expect(screen.getByText('Start from the greeting function')).toBeVisible()
    const disclosure = screen.getByText('View full prompt')
    expect(disclosure.closest('details')).not.toHaveAttribute('open')
    expect(screen.getByText(/Create a research document for this ticket/)).not.toBeVisible()
  })

  it('shows no disclosure for later messages', () => {
    render(
      <Theme>
        <TranscriptPanel events={[event(1, 'user_message', { content: 'One more thing' })]} />
      </Theme>
    )

    expect(screen.getByText('One more thing')).toBeVisible()
    expect(screen.queryByText('View full prompt')).not.toBeInTheDocument()
  })
})
