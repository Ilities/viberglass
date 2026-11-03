import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createSetupRepository, listSetupRepositoryOwners, saveRepository } from '@/service/api/setup-api'
import { getAppHome } from '@/service/api/app-home-api'
import { RepositoryStep } from './RepositoryStep'

jest.mock('@/service/api/setup-api', () => ({
  createSetupRepository: jest.fn(),
  listSetupRepositoryOwners: jest.fn(),
  saveRepository: jest.fn(),
}))
jest.mock('@/service/api/app-home-api', () => ({ getAppHome: jest.fn() }))

const SAVED = {
  fullName: 'acme/laptop-tracker',
  url: 'https://github.com/acme/laptop-tracker',
  defaultBranch: 'main',
  isPrivate: true,
  integrationId: 'i1',
  credentialId: 'c1',
}

function renderStep(createsRepositories = true, onChooseWithoutRepository = jest.fn()) {
  const onDone = jest.fn()
  render(
    <Theme>
      <RepositoryStep createsRepositories={createsRepositories} onDone={onDone} onChooseWithoutRepository={onChooseWithoutRepository} />
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

it('moves on without a repository when App is chosen and the workspace offers it', async () => {
  const onChooseWithoutRepository = jest.fn()
  renderStep(true, onChooseWithoutRepository)
  await screen.findByText(/or App for a tool your team uses/)
  fireEvent.click(screen.getByRole('combobox', { name: 'Space backing' }))
  fireEvent.click(await screen.findByRole('option', { name: 'App' }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  expect(onChooseWithoutRepository).toHaveBeenCalledWith('app')
})

beforeEach(() => {
  jest.resetAllMocks()
  jest.mocked(getAppHome).mockResolvedValue({ home: null, availability: { available: true, missing: [] } })
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
