import type { ProjectScmConfig, Ticket } from '@viberglass/types'
import { describeRunTarget } from './run-target-summary'

const scmConfig: ProjectScmConfig = {
  projectId: 'project-1',
  integrationId: 'integration-1',
  sourceRepository: 'acme/shop',
  baseBranch: 'develop',
  createdAt: '2026-07-22T10:00:00.000Z',
  updatedAt: '2026-07-22T10:00:00.000Z',
}

const ticket: Pick<Ticket, 'id' | 'externalTicketId'> = { id: 'ticket-1', externalTicketId: 'SC-77' }

describe('describeRunTarget', () => {
  it('renders the template the worker will use', () => {
    const target = describeRunTarget(
      { ...scmConfig, branchNameTemplate: 'fix/{{ original_ticket }}', pullRequestBaseBranch: 'main' },
      ticket,
      'runner-1'
    )
    expect(target).toEqual({
      branch: 'fix/SC-77',
      repository: 'acme/shop',
      pullRequestRepository: 'acme/shop',
      base: 'main',
    })
  })

  it('shows the template itself when it depends on the run', () => {
    const target = describeRunTarget({ ...scmConfig, branchNameTemplate: 'agent/{{ timestamp }}' }, ticket, undefined)
    expect(target.branch).toBe('agent/{{ timestamp }}')
    expect(target.base).toBe('develop')
  })
})
