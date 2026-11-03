import { act, renderHook, waitFor } from '@testing-library/react'
import type { RepositoryOwner } from '@viberglass/types'
import { useNewRepository } from './useNewRepository'

const OWNERS: RepositoryOwner[] = [
  { name: 'jane', kind: 'user' },
  { name: 'acme', kind: 'organization' },
]

function setup(initial: { key: string | null; suggested?: string }, load = jest.fn(async () => OWNERS)) {
  const hook = renderHook(({ key, suggested }) => useNewRepository(key, load, suggested), { initialProps: initial })
  return { ...hook, load }
}

describe('useNewRepository', () => {
  it("doesn't load owners until someone chooses to create a repository", async () => {
    const { result, load } = setup({ key: 'token-a' })
    expect(load).not.toHaveBeenCalled()

    act(() => result.current.setSource('new'))

    await waitFor(() => expect(result.current.owners).toEqual(OWNERS))
    expect(load).toHaveBeenCalledTimes(1)
    expect(result.current.owner).toBe('jane')
  })

  it('waits while there is nothing to load owners with', () => {
    const { result, load } = setup({ key: null })

    act(() => result.current.setSource('new'))

    expect(load).not.toHaveBeenCalled()
    expect(result.current.isReady).toBe(false)
  })

  it('keeps the chosen owner when the owners reload with it, and falls back to the first when they reload without it', async () => {
    const load = jest.fn(async () => OWNERS)
    const { result, rerender } = setup({ key: 'token-a' }, load)
    act(() => result.current.setSource('new'))
    await waitFor(() => expect(result.current.owner).toBe('jane'))
    act(() => result.current.setOwner('acme'))

    rerender({ key: 'token-b' })
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.owners).toEqual(OWNERS))
    expect(result.current.owner).toBe('acme')

    load.mockResolvedValue([{ name: 'bob', kind: 'user' }])
    rerender({ key: 'token-c' })
    await waitFor(() => expect(result.current.owner).toBe('bob'))
  })

  it('follows the suggested name until one is typed', () => {
    const { result, rerender } = setup({ key: null, suggested: 'laptop' })
    expect(result.current.name).toBe('laptop')

    rerender({ key: null, suggested: 'laptop-tracker' })
    expect(result.current.name).toBe('laptop-tracker')

    act(() => result.current.setName('laptops'))
    rerender({ key: null, suggested: 'something-else' })
    expect(result.current.name).toBe('laptops')
  })

  it('is ready once an owner is chosen and a name given', async () => {
    const { result } = setup({ key: 'token-a', suggested: '' })
    act(() => result.current.setSource('new'))
    await waitFor(() => expect(result.current.owner).toBe('jane'))
    expect(result.current.isReady).toBe(false)

    act(() => result.current.setName('laptops'))

    expect(result.current.isReady).toBe(true)
  })

  it("shows why the owners couldn't load", async () => {
    const { result } = setup({ key: 'bad' }, jest.fn(async () => Promise.reject(new Error('GitHub rejected this token.'))))

    act(() => result.current.setSource('new'))

    await waitFor(() => expect(result.current.ownersError).toBe('GitHub rejected this token.'))
    expect(result.current.isReady).toBe(false)
  })
})
