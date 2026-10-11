import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Project } from '@viberglass/types'
import { notifyApiChange } from '@/service/api/apiChanges'
import { getProjectBySlug } from '@/service/api/project-api'
import { ProjectProvider, useProject } from './project-context'

jest.mock('@/service/api/project-api', () => ({ getProjectBySlug: jest.fn() }))

const SPACE: Project = {
  id: 'space-1', name: 'Web shop', slug: 'web', ticketSystem: 'custom', credentials: { type: 'token' },
  autoFixEnabled: false, autoFixTags: [], customFieldMappings: {}, isPrivate: false, keyPrefix: 'WEB',
  defaultReviewerIds: [], questionReminderHours: 4, createdAt: '', updatedAt: '',
}

function Content() {
  const { project, isLoading, error } = useProject()
  const [draft, setDraft] = useState('')
  if (isLoading) return <p>Loading space</p>
  return (
    <>
      <p>{project?.name}</p>
      <p>{error}</p>
      <input aria-label="Draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
    </>
  )
}

function renderSpace() {
  return render(
    <MemoryRouter initialEntries={['/spaces/web']}>
      <Routes>
        <Route path="/spaces/:project" element={<ProjectProvider><Content /></ProjectProvider>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('ProjectProvider', () => {
  beforeEach(() => jest.mocked(getProjectBySlug).mockReset())

  it('refreshes space details after a write while keeping the page mounted', async () => {
    let finishRefresh: ((space: Project) => void) | undefined
    const refreshing = new Promise<Project>((resolve) => { finishRefresh = resolve })
    jest.mocked(getProjectBySlug).mockResolvedValueOnce(SPACE).mockReturnValueOnce(refreshing)
    renderSpace()
    await screen.findByText('Web shop')
    fireEvent.change(screen.getByRole('textbox', { name: 'Draft' }), { target: { value: 'Unsaved text' } })

    act(() => notifyApiChange('/api/spaces/space-1'))
    expect(screen.getByText('Web shop')).toBeInTheDocument()
    expect(screen.queryByText('Loading space')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveValue('Unsaved text')

    await act(async () => finishRefresh?.({ ...SPACE, name: 'Storefront' }))
    expect(await screen.findByText('Storefront')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveValue('Unsaved text')
  })

  it('ignores an initial response superseded by a mutation', async () => {
    let finishInitial: ((space: Project) => void) | undefined
    const initial = new Promise<Project>((resolve) => { finishInitial = resolve })
    jest.mocked(getProjectBySlug).mockReturnValueOnce(initial).mockResolvedValueOnce({ ...SPACE, name: 'Storefront' })
    renderSpace()
    act(() => notifyApiChange('/api/spaces/space-1'))
    expect(await screen.findByText('Storefront')).toBeInTheDocument()
    await act(async () => finishInitial?.(SPACE))
    expect(screen.getByText('Storefront')).toBeInTheDocument()
    expect(screen.queryByText('Web shop')).not.toBeInTheDocument()
  })
})
