import { getSetupStatus } from '@/service/api/auth-api'
import { createContext, useContext, useEffect, useState } from 'react'

const DemoInstanceContext = createContext(false)

/** Whether this is a public read-only demo, which whoever deploys it sets; known before anyone signs in. */
export function DemoInstanceProvider({ children }: { children: React.ReactNode }) {
  const [demo, setDemo] = useState(false)

  useEffect(() => {
    let cancelled = false
    getSetupStatus()
      .then((status) => !cancelled && setDemo(status.demoInstance))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  return <DemoInstanceContext.Provider value={demo}>{children}</DemoInstanceContext.Provider>
}

export function useDemoInstance(): boolean {
  return useContext(DemoInstanceContext)
}
