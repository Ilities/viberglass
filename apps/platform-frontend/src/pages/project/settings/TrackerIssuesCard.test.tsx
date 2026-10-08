import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { toast } from 'sonner'
import { saveSpaceIssueRules, type ConnectionSpaceRule, type TrackerIssueRule } from '@/service/api/integration-api'
import type { TrackerConnection } from './TrackerIssuesCard'
import { TrackerIssuesList } from './TrackerIssuesList'

jest.mock('@/service/api/integration-api', () => ({ saveSpaceIssueRules: jest.fn() }))
jest.mock('sonner', () => ({ toast: { success: jest.fn() } }))

const TRACKER = { events: [], setupSteps: [], botUsernameHint: '', botUsernamePlaceholder: '' }

function rule(projectId: string, label: string | null, planNewIssues = false): ConnectionSpaceRule {
  return { id: `${projectId}-${label}`, projectId, integrationId: 'conn-1', label, planNewIssues, projectName: projectId === 'web' ? 'Web shop' : 'API', projectSlug: projectId }
}

function connection(system: string, rules: ConnectionSpaceRule[] = []): TrackerConnection {
  const tracker =
    system === 'github'
      ? { ...TRACKER, tracker: 'GitHub', item: 'issue', items: 'issues', issuesInRepository: true }
      : { ...TRACKER, tracker: 'Jira', item: 'issue', items: 'issues' }
  return { id: 'conn-1', name: `${tracker.tracker} connection`, system, tracker, hasWebhook: true, rules }
}

function renderList(initial: TrackerConnection[], repository: string | null = 'acme/shop') {
  const onSaved = jest.fn()
  function TestList() {
    const [connections, setConnections] = useState(initial)
    function saved(connection: TrackerConnection, own: TrackerIssueRule[]) {
      onSaved(connection, own)
      setConnections((current) => current.map((item) => item.id !== connection.id ? item : {
        ...item,
        rules: [
          ...item.rules.filter((rule) => rule.projectId !== 'web'),
          ...own.map((rule) => ({ ...rule, projectName: 'Web shop', projectSlug: 'web' })),
        ],
      }))
    }
    return <TrackerIssuesList projectId="web" connections={connections} repository={repository} onSaved={saved} />
  }
  render(
    <Theme>
      <MemoryRouter initialEntries={['/spaces/web/settings/issues']}>
        <Routes><Route path="/spaces/:projectSlug/settings/issues" element={<TestList />} /></Routes>
      </MemoryRouter>
    </Theme>
  )
  return { onSaved }
}

function edit(name = 'Jira connection') {
  fireEvent.click(screen.getByRole('button', { name: `Edit ${name}` }))
}

describe('Tracker issue routing', () => {
  beforeEach(() => {
    jest.mocked(saveSpaceIssueRules).mockReset().mockImplementation(async (projectId, integrationId, rules) =>
      rules.map((rule, index) => ({ ...rule, id: `saved-${index}`, projectId, integrationId }))
    )
    jest.mocked(toast.success).mockClear()
  })

  it('shows seven distinct connection summaries with no repeated forms, and opens one editor at a time', () => {
    const connections = Array.from({ length: 7 }, (_, index) => ({
      ...connection('jira', index === 0 ? [rule('web', 'checkout', true)] : []),
      id: `conn-${index}`,
      name: `Jira ${index + 1}`,
    }))
    renderList(connections)

    expect(screen.getAllByRole('button', { name: /^Edit Jira/ })).toHaveLength(7)
    expect(screen.getByText('Labels: checkout')).toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    edit('Jira 1')
    expect(screen.getAllByRole('form')).toHaveLength(1)
    expect(screen.getByRole('radio', { name: 'Matching labels' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Edit Jira 2' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Edit Jira 1' })).toHaveFocus()
    edit('Jira 2')
    expect(screen.getByRole('form', { name: 'Edit Jira 2 issue routing' })).toBeInTheDocument()
  })

  it('takes none until the space chooses, for any tracker', () => {
    renderList([connection('jira')])
    edit()
    expect(screen.getByRole('radio', { name: 'None' })).toBeChecked()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Labels')).not.toBeInTheDocument()
  })

  it('saves labels and planning, retains other spaces, updates the summary and closes the editor', async () => {
    const { onSaved } = renderList([connection('jira', [rule('api', 'checkout')])])
    edit()
    fireEvent.click(screen.getByRole('radio', { name: 'Matching labels' }))
    fireEvent.change(screen.getByLabelText('Labels'), { target: { value: 'frontend, Checkout, frontend' } })
    expect(screen.getByText(/These labels also create tasks in other spaces: Checkout \(API\)/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('switch', { name: 'Automatically write a plan' }))
    expect(screen.getByText('The agent starts planning as soon as a new task arrives.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(saveSpaceIssueRules).toHaveBeenCalledWith('web', 'conn-1', [
      { label: 'frontend', planNewIssues: true },
      { label: 'Checkout', planNewIssues: true },
    ])
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
    expect(screen.getByText('Labels: frontend, Checkout')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit Jira connection' })).toHaveFocus()
    expect(toast.success).toHaveBeenCalledWith('Jira connection issue settings saved')
    edit()
    expect(screen.getByText(/Checkout \(API\)/)).toBeInTheDocument()
  })

  it('saves all repository issues without a label', async () => {
    renderList([connection('github', [rule('web', 'ready')])])
    expect(screen.getByText('GitHub · acme/shop')).toBeInTheDocument()
    edit('GitHub connection')
    expect(screen.getByLabelText('Labels')).toHaveValue('ready')
    fireEvent.click(screen.getByRole('radio', { name: 'All issues' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saveSpaceIssueRules).toHaveBeenCalledWith('web', 'conn-1', [{ label: null, planNewIssues: false }]))
  })

  it('turns incoming issues off by saving no rules', async () => {
    renderList([connection('github', [rule('web', null, true)])])
    edit('GitHub connection')
    expect(screen.getByRole('radio', { name: 'All issues' })).toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: 'None' }))
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saveSpaceIssueRules).toHaveBeenCalledWith('web', 'conn-1', []))
  })

  it('discards all draft changes on Cancel and restores saved values when reopened', () => {
    renderList([connection('jira', [rule('web', 'ready')])])
    edit()
    fireEvent.change(screen.getByLabelText('Labels'), { target: { value: 'checkout' } })
    fireEvent.click(screen.getByRole('switch'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(saveSpaceIssueRules).not.toHaveBeenCalled()
    expect(screen.getByText('Labels: ready')).toBeInTheDocument()
    edit()
    expect(screen.getByLabelText('Labels')).toHaveValue('ready')
    expect(screen.getByRole('switch')).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('validates an empty label filter without saving and focuses the input', () => {
    renderList([connection('jira')])
    edit()
    fireEvent.click(screen.getByRole('radio', { name: 'Matching labels' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter at least one label')
    expect(screen.getByLabelText('Labels')).toHaveFocus()
    expect(screen.getByLabelText('Labels')).toHaveAttribute('aria-invalid', 'true')
    expect(saveSpaceIssueRules).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Labels'), { target: { value: 'checkout' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps failed saves open with the draft intact and allows retrying', async () => {
    jest.mocked(saveSpaceIssueRules).mockRejectedValueOnce(new Error('Could not save'))
    renderList([connection('jira')])
    edit()
    fireEvent.click(screen.getByRole('radio', { name: 'All issues' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save')
    expect(screen.getByRole('radio', { name: 'All issues' })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('form')).not.toBeInTheDocument())
    expect(saveSpaceIssueRules).toHaveBeenCalledTimes(2)
  })

  it('keeps the editor locked while saving and prevents duplicate requests', async () => {
    let resolveSave: ((rules: TrackerIssueRule[]) => void) | undefined
    jest.mocked(saveSpaceIssueRules).mockImplementationOnce(() => new Promise((resolve) => { resolveSave = resolve }))
    renderList([connection('jira')])
    edit()
    fireEvent.click(screen.getByRole('radio', { name: 'All issues' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    fireEvent.submit(screen.getByRole('form'))
    expect(saveSpaceIssueRules).toHaveBeenCalledTimes(1)
    resolveSave?.([rule('web', null)])
    await waitFor(() => expect(screen.queryByRole('form')).not.toBeInTheDocument())
  })

  it('links to repository setup and disables editing when a repository is required', () => {
    renderList([connection('github')], null)
    expect(screen.getByRole('link', { name: 'Set a repository first' })).toHaveAttribute('href', '/spaces/web/settings/repository')
    expect(screen.getByRole('button', { name: 'Edit GitHub connection' })).toBeDisabled()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })

  it('shows missing webhook setup in the summary and editor', () => {
    renderList([{ ...connection('jira'), hasWebhook: false }])
    expect(screen.getByRole('link', { name: 'Webhook setup needed' })).toHaveAttribute('href', '/settings/connections/conn-1')
    edit()
    expect(within(screen.getByRole('form')).getByRole('link', { name: 'connection settings' })).toHaveAttribute('href', '/settings/connections/conn-1')
  })
})
