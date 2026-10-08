import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { saveSpaceIssueRules, type ConnectionSpaceRule } from '@/service/api/integration-api'
import { TrackerIssuesCard, type TrackerConnection } from './TrackerIssuesCard'

jest.mock('@/service/api/integration-api', () => ({ saveSpaceIssueRules: jest.fn() }))

const TRACKER = { events: [], setupSteps: [], botUsernameHint: '', botUsernamePlaceholder: '' }

function rule(projectId: string, label: string | null, planNewIssues = false): ConnectionSpaceRule {
  return { id: `${projectId}-${label}`, projectId, integrationId: 'conn-1', label, planNewIssues, projectName: projectId === 'web' ? 'Web shop' : 'API', projectSlug: projectId }
}

function connection(system: string, rules: ConnectionSpaceRule[] = []): TrackerConnection {
  const tracker = system === 'github' ? { ...TRACKER, tracker: 'GitHub', item: 'issue', items: 'issues' } : { ...TRACKER, tracker: 'Jira', item: 'issue', items: 'issues' }
  return { id: 'conn-1', name: `${tracker.tracker} connection`, system, tracker, hasWebhook: true, rules }
}

function renderCard(props: Partial<Parameters<typeof TrackerIssuesCard>[0]> & { connection: TrackerConnection }) {
  const onSaved = jest.fn()
  render(
    <Theme>
      <MemoryRouter>
        <TrackerIssuesCard projectId="web" repository="acme/shop" onSaved={onSaved} {...props} />
      </MemoryRouter>
    </Theme>
  )
  return { onSaved }
}

describe('TrackerIssuesCard', () => {
  beforeEach(() => jest.mocked(saveSpaceIssueRules).mockReset().mockResolvedValue([]))

  it("saves a Jira space's labels with its plan setting, and says which other spaces take the same label", async () => {
    renderCard({ connection: connection('jira', [rule('api', 'checkout')]) })

    fireEvent.change(screen.getByLabelText('Labels'), { target: { value: 'frontend, Checkout, frontend' } })
    expect(screen.getByText(/Also taken by other spaces: Checkout \(API\)/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('switch', { name: 'Write the plan for new issues' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(saveSpaceIssueRules).toHaveBeenCalledWith('web', 'conn-1', [
        { label: 'frontend', planNewIssues: true },
        { label: 'Checkout', planNewIssues: true },
      ])
    )
  })

  it("takes every GitHub issue in the space's repository, and keeps no rule unless it plans them", async () => {
    renderCard({ connection: connection('github', [rule('web', 'ready')]) })

    expect(screen.getByLabelText('Labels')).toHaveValue('ready')
    fireEvent.click(screen.getByRole('radio', { name: 'Every issue in acme/shop' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(saveSpaceIssueRules).toHaveBeenCalledWith('web', 'conn-1', []))
  })

  it('explains that a space without a GitHub repository takes no GitHub issues', () => {
    renderCard({ connection: connection('github'), repository: null })

    expect(screen.getByText(/has no GitHub repository yet/)).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })
})
