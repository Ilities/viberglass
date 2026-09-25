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
          summary: 'Choose the codebase this project should automate.',
          remediationUrl: '/project/shop/settings',
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

    expect(await screen.findByText('Automation needs setup')).toBeInTheDocument()
    expect(screen.getByText('You can submit tickets now. Complete these items before starting research or execution.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Fix setup' })).toHaveAttribute('href', '/project/shop/settings')
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
          <ProjectReadinessBanner projectId="project-1" firstTaskHref="/project/shop/tickets/create" />
        </MemoryRouter>
      </Theme>,
    )

    expect(await screen.findByText('Ready: try your first task')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create a task' })).toHaveAttribute('href', '/project/shop/tickets/create')
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
        <ProjectReadinessBanner projectId="project-1" firstTaskHref="/project/shop/tickets/create" />
      </MemoryRouter>,
    )

    await waitFor(() => expect(mockedGetProjectReadiness).toHaveBeenCalledWith('project-1'))
    expect(container).toBeEmptyDOMElement()
  })
})
