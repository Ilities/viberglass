import { addressPath, repositoryWebUrl } from './repositoryAddress'

describe('repositoryAddress', () => {
  it('shows an address by its path, whatever the host', () => {
    expect(addressPath('https://github.com/acme/web/pull/12')).toBe('acme/web/pull/12')
    expect(addressPath('https://gitlab.example.com/group/web.git')).toBe('group/web')
    expect(addressPath('acme/web')).toBe('acme/web')
  })

  it('links a repository only when its address names a host', () => {
    expect(repositoryWebUrl('https://gitlab.example.com/group/web.git')).toBe('https://gitlab.example.com/group/web')
    expect(repositoryWebUrl('github.com/acme/web')).toBe('https://github.com/acme/web')
    expect(repositoryWebUrl('acme/web')).toBeNull()
  })
})
