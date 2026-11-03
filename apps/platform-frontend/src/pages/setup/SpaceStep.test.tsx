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
  render(<Theme><MemoryRouter><SpaceStep repository={null} backingKind="files" model={{ provider: 'anthropic' }} onDone={onDone} onChangeRepository={jest.fn()} /></MemoryRouter></Theme>)
  expect(screen.getByText(/no repository needed/)).toBeInTheDocument()
  fireEvent.change(screen.getByRole('textbox', { name: 'Space name' }), { target: { value: 'Slides' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create space' }))
  await waitFor(() => expect(onDone).toHaveBeenCalledWith(created, agent))
  expect(createSpace).toHaveBeenCalledWith({ name: 'Slides', backingKind: 'files' })
  expect(prepareDefaultAgent).toHaveBeenCalledWith({ provider: 'anthropic' })
})

it('creates an App space once, even when preparing the agent has to be retried', async () => {
  const created = { projectId: 'app', name: 'Laptops', slug: 'laptops', backingKind: 'app' as const, repositoryUrl: 'https://github.com/acme/laptops', baseBranch: 'main' }
  const agent = { clankerId: 'c1', slug: 'default-agent', agent: 'opencode' as const, agentName: 'Default agent', compute: 'docker' as const, status: 'deploying' as const, statusMessage: null }
  jest.mocked(createSpace).mockReset().mockResolvedValue(created)
  jest.mocked(prepareDefaultAgent).mockReset().mockRejectedValueOnce(new Error('Docker is not running.')).mockResolvedValue(agent)
  const onDone = jest.fn()
  render(<Theme><MemoryRouter><SpaceStep repository={null} backingKind="app" model={{ provider: 'anthropic' }} onDone={onDone} onChangeRepository={jest.fn()} /></MemoryRouter></Theme>)
  expect(screen.getByText(/creates a private repository/)).toBeInTheDocument()
  fireEvent.change(screen.getByRole('textbox', { name: 'Space name' }), { target: { value: 'Laptops' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create space' }))
  expect(await screen.findByText('Docker is not running.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Create space' }))
  await waitFor(() => expect(onDone).toHaveBeenCalledWith(created, agent))
  expect(createSpace).toHaveBeenCalledTimes(1)
  expect(createSpace).toHaveBeenCalledWith({ name: 'Laptops', backingKind: 'app' })
})
