import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Project, SpaceFilesListing } from '@viberglass/types'
import { useProject } from '@/context/project-context'
import { getSpaceFiles, getSpaceTextFile, saveSpaceTextFile, SpaceRequestError } from '@/service/api/space-files-api'
import { FilesPage } from './FilesPage'
import { fileRows, isEditableText } from './files-table'
import { pathProblem } from './file-dialogs'

jest.mock('@/context/project-context', () => ({ useProject: jest.fn() }))
jest.mock('@/service/api/space-files-api', () => {
  const actual = jest.requireActual('@/service/api/space-files-api')
  return {
    SpaceRequestError: actual.SpaceRequestError,
    getSpaceFiles: jest.fn(),
    getSpaceTextFile: jest.fn(),
    saveSpaceTextFile: jest.fn(),
    uploadSpaceFile: jest.fn(),
    deleteSpaceFile: jest.fn(),
    downloadSpaceFile: jest.fn(),
  }
})
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const SPACE: Project = {
  backingKind: 'files',
  id: 'space-1',
  name: 'Deck',
  slug: 'deck',
  ticketSystem: 'custom',
  credentials: { type: 'token' },
  autoFixEnabled: false,
  autoFixTags: [],
  customFieldMappings: {},
  isPrivate: false,
  keyPrefix: 'DECK',
  defaultReviewerIds: [],
  questionReminderHours: 4,
  viewerAccess: { membership: 'maintainer', canMaintain: true, canCreateTasks: true, canSeeRuns: true },
  createdAt: '',
  updatedAt: '',
}

const LISTING: SpaceFilesListing = {
  snapshot: {
    id: 'snap',
    parentId: null,
    fileCount: 3,
    totalBytes: 3000,
    partial: false,
    changes: { added: 3, changed: 0, removed: 0 },
    createdAt: new Date().toISOString(),
  },
  files: [
    { path: 'notes/brief.md', bytes: 1000, sha256: 'a' },
    { path: 'deck/index.html', bytes: 1500, sha256: 'b' },
    { path: 'README.md', bytes: 500, sha256: 'c' },
  ],
  busy: false,
}

function renderPage(space: Project = SPACE) {
  jest.mocked(useProject).mockReturnValue({ project: space, isLoading: false, error: null })
  render(
    <Theme>
      <MemoryRouter initialEntries={['/spaces/deck/files']}>
        <Routes>
          <Route path="/spaces/:project/files" element={<FilesPage />} />
          <Route path="/spaces/:project" element={<p>Space page</p>} />
        </Routes>
      </MemoryRouter>
    </Theme>
  )
}

beforeEach(() => jest.clearAllMocks())

describe('FilesPage', () => {
  it('lists the space’s files by folder, with what each person may do', async () => {
    jest.mocked(getSpaceFiles).mockResolvedValue(LISTING)
    renderPage()

    const brief = await screen.findByLabelText('notes/brief.md')
    expect(within(brief).getByRole('button', { name: 'Edit notes/brief.md' })).toBeInTheDocument()
    expect(within(screen.getByLabelText('deck/index.html')).queryByRole('button', { name: /Edit/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument()
    expect(screen.getByText(/3 files/)).toBeInTheDocument()
  })

  it('lets people who can’t create tasks only download', async () => {
    jest.mocked(getSpaceFiles).mockResolvedValue(LISTING)
    renderPage({ ...SPACE, viewerAccess: { membership: null, canMaintain: false, canCreateTasks: false, canSeeRuns: false } })

    await screen.findByLabelText('notes/brief.md')
    expect(screen.queryByRole('button', { name: 'Upload' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download notes/brief.md' })).toBeInTheDocument()
  })

  it('explains the files when there are none', async () => {
    jest.mocked(getSpaceFiles).mockResolvedValue({ snapshot: null, files: [], busy: false })
    renderPage()
    expect(await screen.findByText('No files yet')).toBeInTheDocument()
    expect(screen.getByText(/stay here between runs/)).toBeInTheDocument()
  })

  it('says when a run is changing the files', async () => {
    jest.mocked(getSpaceFiles).mockResolvedValue({ ...LISTING, busy: true })
    renderPage()
    expect(await screen.findByRole('status')).toHaveTextContent('A run is changing these files right now')
  })

  it('keeps the person’s text when someone else saved the file first', async () => {
    jest.mocked(getSpaceFiles).mockResolvedValue(LISTING)
    jest.mocked(getSpaceTextFile).mockResolvedValue({ path: 'notes/brief.md', content: '# Brief', sha256: 'a' })
    jest.mocked(saveSpaceTextFile).mockRejectedValue(new SpaceRequestError('Changed', 'FILE_CHANGED', 409))
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Edit notes/brief.md' }))
    const editor = await screen.findByLabelText('Content of notes/brief.md')
    await waitFor(() => expect(editor).toHaveValue('# Brief'))
    fireEvent.change(editor, { target: { value: '# Brief\n\nMy addition' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Someone changed this file since you opened it')
    expect(saveSpaceTextFile).toHaveBeenCalledWith('space-1', { path: 'notes/brief.md', content: '# Brief\n\nMy addition', baseSha256: 'a' })
    expect(screen.getByLabelText('Content of notes/brief.md')).toHaveValue('# Brief\n\nMy addition')
    expect(screen.getByRole('button', { name: 'Load their version' })).toBeInTheDocument()
  })

  it('sends Git spaces back to the space', () => {
    jest.mocked(getSpaceFiles).mockResolvedValue(LISTING)
    renderPage({ ...SPACE, backingKind: 'git' })
    expect(screen.getByText('Space page')).toBeInTheDocument()
  })
})

describe('fileRows', () => {
  it('puts folders before files and each folder above what’s in it', () => {
    const rows = fileRows(LISTING.files).map((row) => `${'  '.repeat(row.depth)}${row.kind === 'folder' ? `${row.name}/` : row.name}`)
    expect(rows).toEqual(['deck/', '  index.html', 'notes/', '  brief.md', 'README.md'])
  })
})

describe('isEditableText', () => {
  it('opens small Markdown and text files only', () => {
    expect(isEditableText({ path: 'a.md', bytes: 10 })).toBe(true)
    expect(isEditableText({ path: 'a.html', bytes: 10 })).toBe(false)
    expect(isEditableText({ path: 'big.txt', bytes: 2 * 1024 * 1024 })).toBe(false)
  })
})

describe('pathProblem', () => {
  it('refuses paths outside the space’s files and the platform folder', () => {
    expect(pathProblem('notes/brief.md')).toBeNull()
    expect(pathProblem('../escape.md')).not.toBeNull()
    expect(pathProblem('/etc/passwd')).not.toBeNull()
    expect(pathProblem('.viberglass/artifacts.json')).toBe('That folder is kept for Viberglass.')
    expect(pathProblem('  ')).toBe('Give the file a name.')
  })
})
