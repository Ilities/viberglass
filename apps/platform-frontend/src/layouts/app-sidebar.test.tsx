import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Project } from '@/service/api/project-api'
import { Theme } from '@radix-ui/themes'
import { AppSidebar } from './app-sidebar'

jest.mock('@/context/theme-context', () => ({ useTheme: () => ({ theme: 'light', setTheme: jest.fn() }) }))

function space(slug: string, backingKind: Project['backingKind']): Project {
  return {
    backingKind,
    id: slug,
    name: slug,
    slug,
    ticketSystem: 'custom',
    credentials: { type: 'token' },
    autoFixEnabled: false,
    autoFixTags: [],
    customFieldMappings: {},
    isPrivate: false,
    keyPrefix: slug.toUpperCase(),
    defaultReviewerIds: [],
    questionReminderHours: 4,
    createdAt: '',
    updatedAt: '',
  }
}

function renderSidebar(current: string) {
  render(
    <Theme>
      <MemoryRouter>
        <AppSidebar
          user={{ id: 'u', name: 'Me', email: 'me@example.com', role: 'member' } as never}
          pathname={`/spaces/${current}`}
          spaces={[space('deck', 'files'), space('web', 'git')]}
          currentSpace={current}
          needsYou={0}
          onSignOut={() => undefined}
        />
      </MemoryRouter>
    </Theme>
  )
}

describe('AppSidebar', () => {
  it('shows a Files space its files and artifacts', () => {
    renderSidebar('deck')
    expect(screen.getByRole('link', { name: /Files/ })).toHaveAttribute('href', '/spaces/deck/files')
    expect(screen.getByRole('link', { name: /Artifacts/ })).toHaveAttribute('href', '/spaces/deck/artifacts')
  })

  it('shows a Git space neither', () => {
    renderSidebar('web')
    expect(screen.queryByRole('link', { name: /Artifacts/ })).not.toBeInTheDocument()
  })
})
