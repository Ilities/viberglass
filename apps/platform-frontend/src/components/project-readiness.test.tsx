import { Theme } from '@radix-ui/themes'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { getProjectReadiness } from '@/service/api/project-api'
import { ProjectReadinessBanner } from './project-readiness'

jest.mock('@/service/api/project-api', () => ({
  getProjectReadiness: jest.fn(),
}))

const mockedGetProjectReadiness = getProjectReadiness as jest.MockedFunction<typeof getProjectReadiness>

describe('ProjectReadinessBanner', () => {
  it('shows actionable setup states while tickets remain available', async () => {
    mockedGetProjectReadiness.mockResolvedValue({
      projectId: 'project-1',
      automationAvailable: false,
      hasRuns: false,
      checks: [
        {
          key: 'repository',
          label: 'Repository',
          state: 'missing',
          code: 'configure_repository',
          summary: 'Choose the codebase this space should automate.',
          remediationUrl: '/spaces/shop/settings',
        },
      ],
    })

    render(
      <Theme>
        <MemoryRouter>
          <ProjectReadinessBanner projectId="project-1" />
        </MemoryRouter>
      </Theme>,
    )

    const banner = await screen.findByRole('region', { name: 'Setup needed' })
    expect(banner).toHaveTextContent('Choose the codebase this space should automate.')
    expect(screen.getByRole('link', { name: 'Choose repository' })).toHaveAttribute('href', '/spaces/shop/settings')
  })

  it('lists every unfinished check for a Files space, including its agent', async () => {
    mockedGetProjectReadiness.mockResolvedValue({
      projectId: 'project-1',
      automationAvailable: false,
      hasRuns: false,
      checks: [
        { key: 'agentCredentials', label: 'Model key', state: 'ready', summary: 'An agent has a model key.' },
        { key: 'storage', label: 'File storage', state: 'missing', code: 'configure_storage', summary: 'File storage is not configured. Ask an administrator to configure it.' },
        { key: 'agentRunner', label: 'Agent', state: 'missing', code: 'start_agent_runner', summary: 'Set up an agent to run tasks.', remediationUrl: '/setup' },
      ],
    })

    render(
      <Theme>
        <MemoryRouter>
          <ProjectReadinessBanner projectId="project-1" />
        </MemoryRouter>
      </Theme>,
    )

    const banner = await screen.findByRole('region', { name: 'Setup needed' })
    expect(banner).toHaveTextContent('File storage is not configured.')
    expect(banner).toHaveTextContent('Set up an agent to run tasks.')
    expect(banner).not.toHaveTextContent('An agent has a model key.')
  })

  it('stays out of the way when automation is ready', async () => {
    mockedGetProjectReadiness.mockResolvedValue({
      projectId: 'project-1',
      automationAvailable: true,
      hasRuns: false,
      checks: [],
    })

    const { container } = render(<ProjectReadinessBanner projectId="project-1" />)

    await waitFor(() => expect(mockedGetProjectReadiness).toHaveBeenCalledWith('project-1'))
    expect(container).toBeEmptyDOMElement()
  })

  it('invites a first task on the space home until something has run (FR7)', async () => {
    mockedGetProjectReadiness.mockResolvedValue({
      projectId: 'project-1',
      automationAvailable: true,
      hasRuns: false,
      checks: [],
    })

    render(
      <Theme>
        <MemoryRouter>
          <ProjectReadinessBanner projectId="project-1" firstTaskHref="/spaces/shop/tasks/new" />
        </MemoryRouter>
      </Theme>,
    )

    expect(await screen.findByText('Ready: try your first task')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create a task' })).toHaveAttribute('href', '/spaces/shop/tasks/new')
  })

  it('drops the invitation once the space has run something', async () => {
    mockedGetProjectReadiness.mockResolvedValue({
      projectId: 'project-1',
      automationAvailable: true,
      hasRuns: true,
      checks: [],
    })

    const { container } = render(
      <MemoryRouter>
        <ProjectReadinessBanner projectId="project-1" firstTaskHref="/spaces/shop/tasks/new" />
      </MemoryRouter>,
    )

    await waitFor(() => expect(mockedGetProjectReadiness).toHaveBeenCalledWith('project-1'))
    expect(container).toBeEmptyDOMElement()
  })

  it('warns ahead of a credential expiring while the space still works', async () => {
    mockedGetProjectReadiness.mockResolvedValue({
      projectId: 'project-1',
      automationAvailable: true,
      hasRuns: true,
      checks: [
        {
          key: 'scmCredential',
          label: 'SCM credential',
          state: 'ready',
          summary: 'The selected SCM credential is available.',
          warning: 'The SCM credential expires on 2026-10-05. Replace it before then, or runs will stop.',
          remediationUrl: '/spaces/shop/settings',
        },
      ],
    })

    render(
      <Theme>
        <MemoryRouter>
          <ProjectReadinessBanner projectId="project-1" />
        </MemoryRouter>
      </Theme>,
    )

    const banner = await screen.findByRole('region', { name: 'Needs attention soon' })
    expect(banner).toHaveTextContent('expires on 2026-10-05')
    expect(screen.getByRole('link', { name: 'Replace it' })).toHaveAttribute('href', '/spaces/shop/settings')
  })
})
