

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { ClankerHealthBadge } from '@/components/clanker-health-badge'
import { DescriptionDetails, DescriptionTerm } from '@/components/description-list'
import { getClankerHealth } from '@/service/api/clanker-api'
import { ReloadIcon } from '@radix-ui/react-icons'
import type { ClankerHealthStatus } from '@viberglass/types'
import { useEffect, useState } from 'react'

export interface ClankerHealthProps {
  clankerId: string
}

/**
 * Client component that fetches and displays clanker health status.
 *
 * Shows a health badge with color and icon, allows manual refresh,
 * and displays detailed health check results.
 */
export function ClankerHealth({ clankerId }: ClankerHealthProps) {
  const [health, setHealth] = useState<ClankerHealthStatus | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (clankerId) {
      getClankerHealth(clankerId)
        .then(setHealth)
        .catch((err) => {
          console.error('Failed to fetch clanker health:', err)
          setError(err instanceof Error ? err.message : 'Failed to fetch health')
        })
    }
  }, [clankerId])

  const handleRefreshHealth = async () => {
    if (!clankerId) return
    setIsRefreshing(true)
    setError(null)
    try {
      const newHealth = await getClankerHealth(clankerId)
      setHealth(newHealth)
    } catch (err) {
      console.error('Failed to refresh health:', err)
      setError(err instanceof Error ? err.message : 'Failed to refresh health')
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <>
      <DescriptionTerm>Health Status</DescriptionTerm>
      <DescriptionDetails>
        <div className="flex items-center gap-2">
          {health ? (
            <ClankerHealthBadge health={health} />
          ) : error ? (
            <Badge color="red">Error</Badge>
          ) : (
            <Badge className="bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">Checking...</Badge>
          )}
          <Button
            plain
            disabled={isRefreshing}
            onClick={handleRefreshHealth}
            className="text-zinc-500 hover:text-zinc-700"
            aria-label="Refresh health status"
          >
            <ReloadIcon className={isRefreshing ? 'animate-spin' : ''} />
          </Button>
        </div>
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
        {health && health.message && <p className="mt-1 text-sm text-zinc-500">{health.message}</p>}
      </DescriptionDetails>

      {health && (
        <>
          <DescriptionTerm>Health Checks</DescriptionTerm>
          <DescriptionDetails>
            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-2">
                <span className={health.checks.resourceExists ? 'text-green-600' : 'text-red-600'}>
                  {health.checks.resourceExists ? '✓' : '✗'}
                </span>
                <span>Resource exists</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={health.checks.deploymentConfigured ? 'text-green-600' : 'text-red-600'}>
                  {health.checks.deploymentConfigured ? '✓' : '✗'}
                </span>
                <span>Deployment configured</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={health.checks.invokerAvailable ? 'text-green-600' : 'text-red-600'}>
                  {health.checks.invokerAvailable ? '✓' : '✗'}
                </span>
                <span>Invoker available</span>
              </div>
              <div className="mt-2 text-xs text-zinc-500">
                Last checked: {new Date(health.lastChecked).toLocaleString()}
              </div>
            </div>
          </DescriptionDetails>
        </>
      )}
    </>
  )
}
