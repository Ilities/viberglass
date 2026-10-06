import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertActions, AlertDescription, AlertTitle } from '@/components/alert'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Dropdown, DropdownButton, DropdownDescription, DropdownItem, DropdownLabel, DropdownMenu } from '@/components/dropdown'
import { EmptyState } from '@/components/empty-state'
import { Heading } from '@/components/heading'
import { PageMeta } from '@/components/page-meta'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { deleteModelDeployment, listModelDeployments, setModelDeploymentMode } from '@/service/api/model-hosting-api'
import type { ModelDeploymentMode, ModelDeploymentView } from '@viberglass/types'
import { ChevronDownIcon, PlusIcon, TrashIcon } from '@radix-ui/react-icons'
import { deploymentState, formatPrice, isSettling } from './deploymentDisplay'
import { DeployModelDialog } from './deploy-model-dialog'

const MODES: Array<{ mode: ModelDeploymentMode; label: string; description: string }> = [
  { mode: 'scale-to-zero', label: 'Scale to zero', description: 'Runs only while agents use it' },
  { mode: 'keep-warm', label: 'Keep warm', description: 'One GPU always on: no start-up wait, billed every hour' },
  { mode: 'stopped', label: 'Stop', description: 'Nothing runs; runs using it fail until started' },
]

/** Open-weight models Viberglass runs in the workspace's cloud accounts. */
export function ModelDeploymentsPage() {
  const [deployments, setDeployments] = useState<ModelDeploymentView[] | null>(null)
  const [deploying, setDeploying] = useState(false)
  const [changing, setChanging] = useState<string | null>(null)
  const [removing, setRemoving] = useState<ModelDeploymentView | null>(null)

  const load = useCallback(() => {
    listModelDeployments()
      .then(setDeployments)
      .catch((error) => {
        setDeployments((previous) => previous ?? [])
        toast.error("Couldn't load model deployments", { description: error instanceof Error ? error.message : undefined })
      })
  }, [])

  useEffect(load, [load])

  // Starting and waking take minutes; look again until they settle.
  const settling = deployments?.some(isSettling) ?? false
  useEffect(() => {
    if (!settling) return
    const timer = setInterval(load, 15_000)
    return () => clearInterval(timer)
  }, [settling, load])

  async function changeMode(deployment: ModelDeploymentView, mode: ModelDeploymentMode) {
    setChanging(deployment.id)
    try {
      await setModelDeploymentMode(deployment.id, mode)
      load()
    } catch (error) {
      toast.error(`Couldn't change ${deployment.name}`, { description: error instanceof Error ? error.message : undefined })
    } finally {
      setChanging(null)
    }
  }

  async function confirmRemove() {
    if (!removing) return
    try {
      await deleteModelDeployment(removing.id)
      setDeployments((previous) => previous?.filter((deployment) => deployment.id !== removing.id) ?? null)
      toast.success('Deployment deleted')
    } catch (error) {
      toast.error("Couldn't delete the deployment", { description: error instanceof Error ? error.message : undefined })
    } finally {
      setRemoving(null)
    }
  }

  const deployButton = (
    <Button color="brand" onClick={() => setDeploying(true)}>
      <PlusIcon />
      Deploy a model
    </Button>
  )

  return (
    <>
      <PageMeta title="Model deployments" />
      <div className="space-y-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Heading>Model deployments</Heading>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Open-weight models on GPUs in your own cloud account. Each one is a model endpoint runners pick in their
              Model section.
            </p>
          </div>
          {deployButton}
        </div>

        {deployments === null ? (
          <div className="py-12 text-center text-zinc-500 dark:text-zinc-400">Loading…</div>
        ) : deployments.length === 0 ? (
          <EmptyState
            title="No model deployments yet"
            description="Deploy a model to a Verda account. It scales to zero when no agent uses it."
            action={deployButton}
          />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Model</TableHeader>
                <TableHeader>State</TableHeader>
                <TableHeader>Used by</TableHeader>
                <TableHeader />
              </TableRow>
            </TableHead>
            <TableBody>
              {deployments.map((deployment) => {
                const state = deploymentState(deployment)
                const price = formatPrice(deployment.pricePerHour, deployment.currency)
                return (
                  <TableRow key={deployment.id}>
                    <TableCell className="max-w-sm font-medium text-zinc-950 dark:text-white">
                      {deployment.name}
                      <div className="truncate font-mono text-xs font-normal text-zinc-500 dark:text-zinc-400">{deployment.model}</div>
                      <div className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
                        Verda · {deployment.flavour.gpuCount > 1 ? `${deployment.flavour.gpuCount} × ` : ''}
                        {deployment.flavour.id}
                        {price && ` · ${price} while running`}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge color={state.color}>{state.label}</Badge>
                      {deployment.status.detail && (
                        <div className="mt-1 max-w-xs text-xs text-zinc-500 dark:text-zinc-400">{deployment.status.detail}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-zinc-500 dark:text-zinc-400">
                      {deployment.runners.length ? deployment.runners.join(', ') : 'No runner'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <Dropdown>
                          <DropdownButton outline disabled={changing === deployment.id}>
                            {changing === deployment.id ? 'Changing…' : MODES.find((m) => m.mode === deployment.mode)?.label}
                            <ChevronDownIcon data-slot="icon" />
                          </DropdownButton>
                          <DropdownMenu align="end">
                            {MODES.filter((option) => option.mode !== deployment.mode).map((option) => (
                              <DropdownItem key={option.mode} onClick={() => void changeMode(deployment, option.mode)}>
                                <DropdownLabel>{option.mode === 'scale-to-zero' && deployment.mode === 'stopped' ? 'Start' : option.label}</DropdownLabel>
                                <DropdownDescription>{option.description}</DropdownDescription>
                              </DropdownItem>
                            ))}
                          </DropdownMenu>
                        </Dropdown>
                        <Button surface color="red" onClick={() => setRemoving(deployment)} aria-label={`Delete ${deployment.name}`}>
                          <TrashIcon className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <DeployModelDialog
        open={deploying}
        onClose={() => setDeploying(false)}
        onCreated={() => {
          setDeploying(false)
          toast.success('Deployment created', { description: 'It downloads the model the first time it starts.' })
          load()
        }}
      />

      <Alert open={removing !== null} onClose={() => setRemoving(null)}>
        <AlertTitle>Delete {removing?.name}?</AlertTitle>
        <AlertDescription>
          The deployment and its endpoint are removed from Verda and Viberglass, and nothing is billed after. A deployment
          a runner uses can&apos;t be deleted.
        </AlertDescription>
        <AlertActions>
          <Button outline onClick={() => setRemoving(null)}>
            Cancel
          </Button>
          <Button color="red" onClick={confirmRemove}>
            Delete
          </Button>
        </AlertActions>
      </Alert>
    </>
  )
}
