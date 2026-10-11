import { connectionOptionLabel } from './RepositoryFields'

describe('connectionOptionLabel', () => {
  it('shows the name alone when it already names the provider', () => {
    expect(connectionOptionLabel('GitHub 2', 'GitHub')).toBe('GitHub 2')
    expect(connectionOptionLabel('Acme github', 'GitHub')).toBe('Acme github')
  })

  it('adds the provider when the name does not say it', () => {
    expect(connectionOptionLabel('Acme', 'GitHub')).toBe('Acme (GitHub)')
  })
})
