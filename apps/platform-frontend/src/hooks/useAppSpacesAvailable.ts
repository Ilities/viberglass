import { getAppHome } from '@/service/api/app-home-api'
import { useEffect, useState } from 'react'

/** Whether App spaces can be created here; false until known. */
export function useAppSpacesAvailable(): boolean {
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    let cancelled = false
    getAppHome()
      .then((status) => !cancelled && setAvailable(status.availability.available))
      .catch(() => !cancelled && setAvailable(false))
    return () => {
      cancelled = true
    }
  }, [])
  return available
}
