import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertActions, AlertDescription, AlertTitle } from '@/components/alert'
import { Button } from '@/components/button'
import { EmptyState } from '@/components/empty-state'
import { Heading } from '@/components/heading'
import { PageMeta } from '@/components/page-meta'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { getClankers } from '@/service/api/clanker-api'
import { deleteMcpServer, listMcpServers } from '@/service/api/mcp-server-api'
import { listAllSecrets, type Secret } from '@/service/api/secret-api'
import { isSecretHeader, type Clanker, type McpServer } from '@viberglass/types'
import { Pencil1Icon, PlusIcon, TrashIcon } from '@radix-ui/react-icons'
import { McpServerDialog } from './mcp-server-dialog'

/** Names of the runners that give their agent each server, by server id. */
function runnersByServer(runners: Clanker[]): Map<string, string[]> {
  const names = new Map<string, string[]>()
  for (const runner of runners) {
    for (const id of runner.mcpServerIds) names.set(id, [...(names.get(id) ?? []), runner.name])
  }
  return names
}

function describeHeaders(server: McpServer, secrets: Secret[]): string {
  if (server.headers.length === 0) return 'None'
  return server.headers
    .map((header) => (isSecretHeader(header) ? `${header.name}: ${secrets.find((s) => s.id === header.secretId)?.name ?? 'missing secret'}` : header.name))
    .join(', ')
}

/** The workspace's approved MCP servers, which runners pick from. */
export function McpServersPage() {
  const [servers, setServers] = useState<McpServer[]>([])
  const [secrets, setSecrets] = useState<Secret[]>([])
  const [runners, setRunners] = useState<Clanker[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<McpServer | undefined>()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [removing, setRemoving] = useState<McpServer | null>(null)
  const usedBy = useMemo(() => runnersByServer(runners), [runners])

  useEffect(() => {
    Promise.all([listMcpServers(), listAllSecrets(), getClankers(100).catch(() => [])])
      .then(([servers, secrets, runners]) => {
        setServers(servers)
        setSecrets(secrets.filter((secret) => !secret.purpose))
        setRunners(runners)
      })
      .catch((error) => toast.error("Couldn't load MCP servers", { description: error instanceof Error ? error.message : undefined }))
      .finally(() => setLoading(false))
  }, [])

  function openDialog(server?: McpServer) {
    setEditing(server)
    setDialogOpen(true)
  }

  function saved(server: McpServer) {
    setServers((previous) => [...previous.filter((other) => other.id !== server.id), server].sort((a, b) => a.name.localeCompare(b.name)))
    setDialogOpen(false)
    toast.success(editing ? 'MCP server saved' : 'MCP server approved')
  }

  async function confirmRemove() {
    if (!removing) return
    try {
      await deleteMcpServer(removing.id)
      setServers((previous) => previous.filter((server) => server.id !== removing.id))
      toast.success('MCP server removed')
    } catch (error) {
      toast.error("Couldn't remove the MCP server", { description: error instanceof Error ? error.message : undefined })
    } finally {
      setRemoving(null)
    }
  }

  return (
    <>
      <PageMeta title="MCP servers" />
      <div className="space-y-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Heading>MCP servers</Heading>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Remote tools agents may use, such as an issue tracker or docs search. Approve a server here, then pick it in
              a runner&apos;s Tools section.
            </p>
          </div>
          <Button color="brand" onClick={() => openDialog()}>
            <PlusIcon />
            Approve server
          </Button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-zinc-500 dark:text-zinc-400">Loading…</div>
        ) : servers.length === 0 ? (
          <EmptyState
            title="No MCP servers yet"
            description="Approve a server's URL, with a token from the Secrets page if it needs one."
            action={
              <Button color="brand" onClick={() => openDialog()}>
                <PlusIcon />
                Approve server
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Server</TableHeader>
                <TableHeader>Headers</TableHeader>
                <TableHeader>Used by</TableHeader>
                <TableHeader />
              </TableRow>
            </TableHead>
            <TableBody>
              {servers.map((server) => (
                <TableRow key={server.id}>
                  <TableCell className="max-w-sm font-medium text-zinc-950 dark:text-white">
                    <span className="font-mono">{server.name}</span>
                    <div className="truncate text-xs font-normal text-zinc-500 dark:text-zinc-400">{server.url}</div>
                    {server.description && <div className="truncate text-xs font-normal text-zinc-500 dark:text-zinc-400">{server.description}</div>}
                  </TableCell>
                  <TableCell className="text-zinc-500 dark:text-zinc-400">{describeHeaders(server, secrets)}</TableCell>
                  <TableCell className="text-zinc-500 dark:text-zinc-400">{usedBy.get(server.id)?.join(', ') ?? 'No runner'}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <Button plain onClick={() => openDialog(server)} aria-label={`Edit ${server.name}`}>
                        <Pencil1Icon className="h-4 w-4" />
                      </Button>
                      <Button surface color="red" onClick={() => setRemoving(server)} aria-label={`Remove ${server.name}`}>
                        <TrashIcon className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <McpServerDialog open={dialogOpen} server={editing} secrets={secrets} onClose={() => setDialogOpen(false)} onSaved={saved} />

      <Alert open={removing !== null} onClose={() => setRemoving(null)}>
        <AlertTitle>Remove {removing?.name}?</AlertTitle>
        <AlertDescription>Runners can no longer pick it. A server some runner still uses can&apos;t be removed.</AlertDescription>
        <AlertActions>
          <Button outline onClick={() => setRemoving(null)}>
            Cancel
          </Button>
          <Button color="red" onClick={confirmRemove}>
            Remove
          </Button>
        </AlertActions>
      </Alert>
    </>
  )
}
