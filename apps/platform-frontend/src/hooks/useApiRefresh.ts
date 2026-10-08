import { subscribeApiChanges } from '@/service/api/apiChanges'
import { useEffect, useState } from 'react'

/** A dependency for effects that load data affected by writes to these API paths. */
export function useApiRefresh(...paths: string[]): number {
  const [revision, setRevision] = useState(0)
  const key = paths.join('\n')

  useEffect(() => {
    const prefixes = key.split('\n')
    return subscribeApiChanges((pathname) => {
      if (prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
        setRevision((current) => current + 1)
      }
    })
  }, [key])

  return revision
}
