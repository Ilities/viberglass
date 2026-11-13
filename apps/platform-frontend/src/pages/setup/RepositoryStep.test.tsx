import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createSetupRepository, listSetupRepositoryOwners, saveRepository, saveSetupAppHome } from '@/service/api/setup-api'
import type { SetupStatus } from '@viberglass/types'
import { RepositoryStep } from './RepositoryStep'

jest.mock('@/service/api/setup-api', () => ({
  createSetupRepository: jest.fn(),
  listSetupRepositoryOwners: jest.fn(),
  saveRepository: jest.fn(),
  saveSetupAppHome: jest.fn(),
}))

const SAVED = {
  fullName: 'acme/laptop-tracker',
  url: 'https://github.com/acme/laptop-tracker',
  defaultBranch: 'main',
  isPrivate: true,
  integrationId: 'i1',
  credentialId: 'c1',
}

function renderStep(
  createsRepositories = true,
  onChooseWithoutRepository = jest.fn(),
  appSpaces: SetupStatus['appSpaces'] = 'unavailable',
  onAppHomeSaved = jest.fn()
) {
  const onDone = jest.fn()
  render(
    <Theme>
      <RepositoryStep
        createsRepositories={createsRepositories}
        appSpaces={appSpaces}
        onAppHomeSaved={onAppHomeSaved}
        onDone={onDone}
        onChooseWithoutRepository={onChooseWithoutRepository}
      />
    </Theme>
  )
  return onDone
}

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.assign(global, { ResizeObserver: ResizeObserverMock })
  Element.prototype.scrollIntoView = jest.fn()
})

beforeEach(() => {
  jest.resetAllMocks()
})

it('starts on App and moves on without a repository when App spaces are ready', () => {
  const onChooseWithoutRepository = jest.fn()
  renderStep(true, onChooseWithoutRepository, 'available')
  expect(screen.getByText(/Choose App for a tool your team uses/)).toBeInTheDocument()
  expect(screen.queryByLabelText('GitHub access token')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  expect(onChooseWithoutRepository).toHaveBeenCalledWith('app')
})

it('saves the App home from a token and an owner when that is all App spaces still need', async () => {
  jest.mocked(listSetupRepositoryOwners).mockResolvedValue([
    { name: 'jane', kind: 'user' },
    { name: 'acme', kind: 'organization' },
  ])
  jest.mocked(saveSetupAppHome).mockResolvedValue({ home: null, availability: { available: true, missing: [] } })
  const onChooseWithoutRepository = jest.fn()
  const onAppHomeSaved = jest.fn()
  renderStep(true, onChooseWithoutRepository, 'needs_home', onAppHomeSaved)

  expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('GitHub access token'), { target: { value: 'ghp_abc' } })
  await waitFor(() => expect(listSetupRepositoryOwners).toHaveBeenCalledWith('ghp_abc'))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

  await waitFor(() => expect(onChooseWithoutRepository).toHaveBeenCalledWith('app'))
  expect(saveSetupAppHome).toHaveBeenCalledWith('jane', 'ghp_abc')
  expect(onAppHomeSaved).toHaveBeenCalled()
})

it("doesn't offer App when the installation can't run apps", () => {
  renderStep(true, jest.fn(), 'unavailable')
  expect(screen.getByText(/Use a repository for code, or Files/)).toBeInTheDocument()
})

it('creates a repository where the token can, and hands it on like a checked one', async () => {
  jest.mocked(listSetupRepositoryOwners).mockResolvedValue([
    { name: 'jane', kind: 'user' },
    { name: 'acme', kind: 'organization' },
  ])
  jest.mocked(createSetupRepository).mockResolvedValue(SAVED)
  const onDone = renderStep()

  fireEvent.click(screen.getByRole('radio', { name: 'Create a new repository' }))
  expect(screen.queryByRole('textbox', { name: 'Repository' })).not.toBeInTheDocument()
  expect(screen.getByText('Paste the token above to choose where the repository goes.')).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText('Access token'), { target: { value: 'ghp_abc' } })
  await waitFor(() => expect(listSetupRepositoryOwners).toHaveBeenCalledWith('ghp_abc'))
  fireEvent.change(await screen.findByRole('textbox', { name: 'Repository name' }), { target: { value: 'laptop-tracker' } })
  expect(await screen.findByText(/jane\/laptop-tracker will be private/)).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Create repository' }))

  await waitFor(() => expect(onDone).toHaveBeenCalledWith(SAVED))
  expect(createSetupRepository).toHaveBeenCalledWith({ owner: 'jane', name: 'laptop-tracker' }, 'ghp_abc')
  expect(saveRepository).not.toHaveBeenCalled()
})

it("shows why the repository couldn't be created", async () => {
  jest.mocked(listSetupRepositoryOwners).mockResolvedValue([{ name: 'jane', kind: 'user' }])
  jest.mocked(createSetupRepository).mockRejectedValue(new Error("This token can't create repositories in jane: it needs more."))
  const onDone = renderStep()

  fireEvent.click(screen.getByRole('radio', { name: 'Create a new repository' }))
  fireEvent.change(screen.getByLabelText('Access token'), { target: { value: 'ghp_abc' } })
  fireEvent.change(screen.getByRole('textbox', { name: 'Repository name' }), { target: { value: 'laptops' } })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Create repository' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Create repository' }))

  expect(await screen.findByRole('alert')).toHaveTextContent("This token can't create repositories in jane: it needs more.")
  expect(onDone).not.toHaveBeenCalled()
})

it('only offers an existing repository when the code host cannot create one', () => {
  renderStep(false)

  expect(screen.queryByRole('radio', { name: 'Create a new repository' })).not.toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: 'Repository' })).toBeInTheDocument()
})
