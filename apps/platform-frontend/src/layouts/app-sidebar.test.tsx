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
  it("leaves a space's own pages to its tabs", () => {
    renderSidebar('deck')
    for (const label of [/^Files$/, /^Artifacts$/, /^Runs$/, /Space settings/]) {
      expect(screen.queryByRole('link', { name: label })).not.toBeInTheDocument()
    }
  })
})
