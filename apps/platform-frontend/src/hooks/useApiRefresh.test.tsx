import { act, renderHook } from '@testing-library/react'
import { notifyApiChange } from '@/service/api/apiChanges'
import { useApiRefresh } from './useApiRefresh'

describe('useApiRefresh', () => {
  it('refreshes for writes to a watched collection or its children, without matching similar names', () => {
    const { result } = renderHook(() => useApiRefresh('/api/spaces', '/api/tasks'))
    act(() => {
      notifyApiChange('/api/spaces')
      notifyApiChange('/api/spaces/space-1/archive')
      notifyApiChange('/api/tasks/task-1')
      notifyApiChange('/api/spaces-other')
      notifyApiChange('/api/secrets')
    })
    expect(result.current).toBe(3)
  })

  it('uses the current paths and removes subscriptions on unmount', () => {
    const { result, rerender, unmount } = renderHook((path) => useApiRefresh(path), { initialProps: '/api/spaces' })
    rerender('/api/tasks')
    act(() => {
      notifyApiChange('/api/spaces')
      notifyApiChange('/api/tasks/task-1')
    })
    expect(result.current).toBe(1)
    unmount()
    act(() => notifyApiChange('/api/tasks'))
    expect(result.current).toBe(1)
  })
})
