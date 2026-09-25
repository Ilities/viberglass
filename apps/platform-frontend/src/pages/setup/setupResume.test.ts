import type { SetupStatus } from '@viberglass/types'
import { readStoredRepository, resumeSetup, storeRepository } from './setupResume'

const FRESH: SetupStatus = {
  connectedProviders: [],
  repositoryConnected: false,
  space: null,
  agent: null,
  complete: false,
  demo: null,
}

const REPOSITORY = { fullName: 'Acme/web', url: 'https://github.com/Acme/web', defaultBranch: 'main', isPrivate: true }
const SPACE = { projectId: 'p1', name: 'web', slug: 'web', repositoryUrl: 'https://github.com/Acme/web' }

describe('resumeSetup', () => {
  it('starts with the model key on a fresh workspace', () => {
    expect(resumeSetup(FRESH, null)).toEqual({ step: 'model', provider: null })
  })

  it('asks for the repository once a key is saved', () => {
    expect(resumeSetup({ ...FRESH, connectedProviders: ['opencode-go'] }, null)).toEqual({
      step: 'repository',
      provider: 'opencode-go',
    })
  })

  it('goes on to the space when the checked repository is remembered', () => {
    const status = { ...FRESH, connectedProviders: ['anthropic' as const], repositoryConnected: true }
    expect(resumeSetup(status, REPOSITORY).step).toBe('space')
  })

  it('asks for the repository again when the token is saved but the repository was forgotten', () => {
    const status = { ...FRESH, connectedProviders: ['anthropic' as const], repositoryConnected: true }
    expect(resumeSetup(status, null).step).toBe('repository')
  })

  it('waits for the agent after the space exists', () => {
    const status = {
      ...FRESH,
      connectedProviders: ['anthropic' as const],
      space: SPACE,
      agent: { clankerId: 'c1', agentName: 'Claude Code', status: 'deploying' as const, statusMessage: null },
    }
    expect(resumeSetup(status, null).step).toBe('agent')
  })

  it('offers the first task once the agent is active', () => {
    const status = {
      ...FRESH,
      connectedProviders: ['anthropic' as const],
      space: SPACE,
      agent: { clankerId: 'c1', agentName: 'Claude Code', status: 'active' as const, statusMessage: null },
    }
    expect(resumeSetup(status, null).step).toBe('task')
  })
})

describe('stored repository', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips without the token', () => {
    storeRepository(REPOSITORY)
    expect(readStoredRepository()).toEqual({ ...REPOSITORY, isPrivate: false })
  })

  it('ignores a malformed entry', () => {
    localStorage.setItem('viberglass.setup.repository', '{"fullName": 3')
    expect(readStoredRepository()).toBeNull()
  })
})
