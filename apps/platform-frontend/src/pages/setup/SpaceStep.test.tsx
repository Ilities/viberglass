import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { createSpace, prepareDefaultAgent } from '@/service/api/setup-api'
import { SpaceStep } from './SpaceStep'

jest.mock('@/service/api/setup-api', () => ({ createSpace: jest.fn(), prepareDefaultAgent: jest.fn() }))

it('creates the first Files space without a repository and prepares its agent', async () => {
  const created = { projectId: 'files', name: 'Slides', slug: 'slides', backingKind: 'files' as const, repositoryUrl: null, baseBranch: null }
  const agent = { clankerId: 'c1', slug: 'default-agent', agent: 'opencode' as const, agentName: 'Default agent', compute: 'docker' as const, status: 'deploying' as const, statusMessage: null }
  jest.mocked(createSpace).mockResolvedValue(created)
  jest.mocked(prepareDefaultAgent).mockResolvedValue(agent)
  const onDone = jest.fn()
  render(<Theme><MemoryRouter><SpaceStep repository={null} model={{ provider: 'anthropic' }} onDone={onDone} onChangeRepository={jest.fn()} /></MemoryRouter></Theme>)
  expect(screen.getByText(/no repository needed/)).toBeInTheDocument()
  fireEvent.change(screen.getByRole('textbox', { name: 'Space name' }), { target: { value: 'Slides' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create space' }))
  await waitFor(() => expect(onDone).toHaveBeenCalledWith(created, agent))
  expect(createSpace).toHaveBeenCalledWith({ name: 'Slides', backingKind: 'files' })
  expect(prepareDefaultAgent).toHaveBeenCalledWith({ provider: 'anthropic' })
})
