import { act, renderHook } from '@testing-library/react'
import { useDebounce } from './useDebounce'

describe('useDebounce', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('holds the value back until it stops changing', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), { initialProps: { value: 'a' } })

    rerender({ value: 'ab' })
    expect(result.current).toBe('a')

    act(() => {
      jest.advanceTimersByTime(299)
    })
    expect(result.current).toBe('a')

    act(() => {
      jest.advanceTimersByTime(1)
    })
    expect(result.current).toBe('ab')
  })

  it('starts over when the value changes again', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), { initialProps: { value: 'a' } })

    rerender({ value: 'ab' })
    act(() => {
      jest.advanceTimersByTime(200)
    })
    rerender({ value: 'abc' })
    act(() => {
      jest.advanceTimersByTime(200)
    })

    expect(result.current).toBe('a')

    act(() => {
      jest.advanceTimersByTime(100)
    })
    expect(result.current).toBe('abc')
  })
})
