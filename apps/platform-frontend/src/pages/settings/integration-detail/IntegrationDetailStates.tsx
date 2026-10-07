import { Button } from '@/components/button'
import { ExclamationTriangleIcon } from '@radix-ui/react-icons'

export function IntegrationDetailLoadingState() {
  return (
    <div className="p-6 lg:p-8">
      <div className="text-sm text-zinc-500 dark:text-zinc-400">Loading connection...</div>
    </div>
  )
}

interface IntegrationDetailErrorStateProps {
  message: string
}

export function IntegrationDetailErrorState({ message }: IntegrationDetailErrorStateProps) {
  return (
    <div className="p-6 lg:p-8">
      <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-900 dark:bg-red-900/20">
        <ExclamationTriangleIcon className="mx-auto size-12 text-red-500" />
        <h2 className="mt-4 text-lg font-semibold text-red-900 dark:text-red-400">Couldn&apos;t load the connection</h2>
        <p className="mt-2 text-red-700 dark:text-red-300">{message}</p>
        <Button href="/settings/connections" color="brand" className="mt-6">
          Back to connections
        </Button>
      </div>
    </div>
  )
}

export function IntegrationDetailNotFoundState() {
  return (
    <div className="p-6 lg:p-8">
      <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-900 dark:bg-red-900/20">
        <ExclamationTriangleIcon className="mx-auto size-12 text-red-500" />
        <h2 className="mt-4 text-lg font-semibold text-red-900 dark:text-red-400">Connection not found</h2>
        <p className="mt-2 text-red-700 dark:text-red-300">This connection doesn&apos;t exist.</p>
        <Button href="/settings/connections" color="brand" className="mt-6">
          Back to connections
        </Button>
      </div>
    </div>
  )
}
