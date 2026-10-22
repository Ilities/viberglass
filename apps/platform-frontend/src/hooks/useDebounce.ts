import { useEffect, useState } from 'react'

/** The value, but only after it has stopped changing for `delay` milliseconds. */
export function useDebounce<T>(value: T, delay = 300): T {
  const [settled, setSettled] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return settled
}
