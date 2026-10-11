import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertActions, AlertDescription, AlertTitle } from '@/components/alert'
import { Button } from '@/components/button'
import { Subheading } from '@/components/heading'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { deleteModelEndpoint, listModelEndpoints } from '@/service/api/model-endpoint-api'
import { listAllSecrets, type Secret } from '@/service/api/secret-api'
import { MODEL_API_FORMAT_LABELS, MODEL_API_FORMATS, type ModelEndpointView } from '@viberglass/types'
import { Pencil1Icon, PlusIcon, TrashIcon } from '@radix-ui/react-icons'
import { ModelEndpointDialog } from './ModelEndpointDialog'

/** Model lists run to dozens; the rest show on hover. */
const SHOWN_MODELS = 3

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** Model APIs that already run somewhere, connected by URL. */
export function ConnectedModelsSection() {
  const [endpoints, setEndpoints] = useState<ModelEndpointView[] | null>(null)
  const [secrets, setSecrets] = useState<Secret[]>([])
  const [editing, setEditing] = useState<ModelEndpointView | 'new' | null>(null)
  const [removing, setRemoving] = useState<ModelEndpointView | null>(null)

  const load = useCallback(() => {
    listModelEndpoints()
      .then((all) => setEndpoints(all.filter((endpoint) => endpoint.source === 'manual')))
      .catch((error) => {
        setEndpoints((previous) => previous ?? [])
        toast.error("Couldn't load connected models", { description: error instanceof Error ? error.message : undefined })
      })
  }, [])

  useEffect(load, [load])

  async function open(endpoint: ModelEndpointView | 'new') {
    try {
      setSecrets(await listAllSecrets())
      setEditing(endpoint)
    } catch (error) {
      toast.error("Couldn't load keys", { description: error instanceof Error ? error.message : undefined })
    }
  }

  async function confirmRemove() {
    if (!removing) return
    try {
      await deleteModelEndpoint(removing.id)
      setEndpoints((previous) => previous?.filter((endpoint) => endpoint.id !== removing.id) ?? null)
      toast.success('Model removed')
    } catch (error) {
      toast.error("Couldn't remove the model", { description: error instanceof Error ? error.message : undefined })
    } finally {
      setRemoving(null)
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <Subheading>Connected models</Subheading>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Any OpenAI- or Anthropic-compatible API, from a provider or your own server.
          </p>
        </div>
        <Button outline onClick={() => void open('new')}>
          <PlusIcon />
          Connect a model
        </Button>
      </div>
      {endpoints === null ? (
        <div className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">Loading…</div>
      ) : (
        endpoints.length > 0 && (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Name</TableHeader>
                <TableHeader>Models</TableHeader>
                <TableHeader>Used by</TableHeader>
                <TableHeader />
              </TableRow>
            </TableHead>
            <TableBody>
              {endpoints.map((endpoint) => (
                <TableRow key={endpoint.id}>
                  <TableCell className="max-w-sm font-medium text-zinc-950 dark:text-white">
                    {endpoint.name}
                    <div className="truncate font-mono text-xs font-normal text-zinc-500 dark:text-zinc-400">
                      {hostOf(endpoint.baseUrl)}
                    </div>
                    <div className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
                      {MODEL_API_FORMAT_LABELS[endpoint.apiFormat]}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-xs text-xs whitespace-normal text-zinc-500 dark:text-zinc-400">
                    <span title={endpoint.models.join('\n')}>
                      <span className="font-mono">{endpoint.models.slice(0, SHOWN_MODELS).join(', ')}</span>
                      {endpoint.models.length > SHOWN_MODELS && ` and ${endpoint.models.length - SHOWN_MODELS} more`}
                    </span>
                  </TableCell>
                  <TableCell className="text-zinc-500 dark:text-zinc-400">
                    {endpoint.runners.length ? endpoint.runners.join(', ') : 'No agent'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <Button plain onClick={() => void open(endpoint)} aria-label={`Edit ${endpoint.name}`}>
                        <Pencil1Icon className="h-4 w-4" />
                      </Button>
                      <Button surface color="red" onClick={() => setRemoving(endpoint)} aria-label={`Remove ${endpoint.name}`}>
                        <TrashIcon className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )
      )}

      {editing !== null && (
        <ModelEndpointDialog
          open
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
          secrets={secrets}
          formats={MODEL_API_FORMATS}
          initial={editing === 'new' ? undefined : editing}
        />
      )}

      <Alert open={removing !== null} onClose={() => setRemoving(null)}>
        <AlertTitle>Remove {removing?.name}?</AlertTitle>
        <AlertDescription>
          Viberglass forgets the connection; the model keeps running wherever it is hosted. A model an agent uses can&apos;t
          be removed.
        </AlertDescription>
        <AlertActions>
          <Button outline onClick={() => setRemoving(null)}>
            Cancel
          </Button>
          <Button color="red" onClick={confirmRemove}>
            Remove
          </Button>
        </AlertActions>
      </Alert>
    </section>
  )
}
