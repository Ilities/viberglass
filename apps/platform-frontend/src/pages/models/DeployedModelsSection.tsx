import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertActions, AlertDescription, AlertTitle } from '@/components/alert'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Dropdown, DropdownButton, DropdownDescription, DropdownItem, DropdownLabel, DropdownMenu } from '@/components/dropdown'
import { Subheading } from '@/components/heading'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { deleteModelDeployment, listModelDeployments, setModelDeploymentMode } from '@/service/api/model-hosting-api'
import { MODEL_HOST_LABELS, type ModelDeploymentMode, type ModelDeploymentView } from '@viberglass/types'
import { ChevronDownIcon, PlusIcon, TrashIcon } from '@radix-ui/react-icons'
import { deploymentState, formatPrice, isSettling } from './deploymentDisplay'
import { DeployModelDialog } from './deploy-model-dialog'

const MODES: Array<{ mode: ModelDeploymentMode; label: string; description: string }> = [
  { mode: 'scale-to-zero', label: 'Scale to zero', description: 'Runs only while agents use it' },
  { mode: 'keep-warm', label: 'Keep warm', description: 'One GPU always on: no start-up wait, billed every hour' },
  { mode: 'stopped', label: 'Stop', description: 'Nothing runs; runs using it fail until started' },
]

/** Open-weight models Viberglass runs in the workspace's cloud accounts. */
export function DeployedModelsSection() {
  const [deployments, setDeployments] = useState<ModelDeploymentView[] | null>(null)
  const [deploying, setDeploying] = useState(false)
  const [changing, setChanging] = useState<string | null>(null)
  const [removing, setRemoving] = useState<ModelDeploymentView | null>(null)

  const load = useCallback(() => {
    listModelDeployments()
      .then(setDeployments)
      .catch((error) => {
        setDeployments((previous) => previous ?? [])
        toast.error("Couldn't load deployed models", { description: error instanceof Error ? error.message : undefined })
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

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <Subheading>Deployed models</Subheading>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Open-weight models Viberglass runs on GPUs in your cloud account. The cloud bills them while they run.
          </p>
        </div>
        <Button outline onClick={() => setDeploying(true)}>
          <PlusIcon />
          Deploy a model
        </Button>
      </div>

      {deployments === null ? (
        <div className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">Loading…</div>
      ) : (
        deployments.length > 0 && (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Name</TableHeader>
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
                        {MODEL_HOST_LABELS[deployment.host]} · {deployment.flavour.gpuCount > 1 ? `${deployment.flavour.gpuCount} × ` : ''}
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
                      {deployment.runners.length ? deployment.runners.join(', ') : 'No agent'}
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
        )
      )}

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
          The deployment is removed from {removing ? MODEL_HOST_LABELS[removing.host] : 'the cloud'} and from Viberglass,
          and nothing is billed after. A model an agent uses can&apos;t be deleted.
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
    </section>
  )
}
