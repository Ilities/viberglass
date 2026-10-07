import { repositoryName } from './jobs-table'

describe('repositoryName', () => {
  it('shows owner/repo for HTTPS and SSH addresses', () => {
    expect(repositoryName('https://github.com/acme/token.observer')).toBe('acme/token.observer')
    expect(repositoryName('https://github.com/acme/web-shop.git/')).toBe('acme/web-shop')
    expect(repositoryName('git@github.com:acme/web-shop.git')).toBe('acme/web-shop')
  })
})
