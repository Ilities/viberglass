import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { createSpace, prepareDefaultAgent } from '@/service/api/setup-api'
import { SpaceStep } from './SpaceStep'

jest.mock('@/service/api/setup-api', () => ({ createSpace: jest.fn(), prepareDefaultAgent: jest.fn() }))

it('creates the first Files space without requesting a repository or starting an unusable runner', async () => {
  const created = { projectId: 'files', name: 'Slides', slug: 'slides', backingKind: 'files' as const, repositoryUrl: null, baseBranch: null }
  jest.mocked(createSpace).mockResolvedValue(created)
  const onDone = jest.fn()
  render(<Theme><MemoryRouter><SpaceStep repository={null} model={{ provider: 'anthropic' }} onDone={onDone} onChangeRepository={jest.fn()} /></MemoryRouter></Theme>)
  expect(screen.getByText(/no repository needed/)).toBeInTheDocument()
  fireEvent.change(screen.getByRole('textbox', { name: 'Space name' }), { target: { value: 'Slides' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create space' }))
  await waitFor(() => expect(onDone).toHaveBeenCalledWith(created, null))
  expect(createSpace).toHaveBeenCalledWith({ name: 'Slides', backingKind: 'files' })
  expect(prepareDefaultAgent).not.toHaveBeenCalled()
})
