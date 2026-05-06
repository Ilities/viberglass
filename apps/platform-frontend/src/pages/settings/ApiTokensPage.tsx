import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@/components/dialog'
import { Field, FieldGroup, Fieldset, Label } from '@/components/fieldset'
import { Heading, Subheading } from '@/components/heading'
import { Input } from '@/components/input'
import { PageMeta } from '@/components/page-meta'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { Text } from '@/components/text'
import { Timestamp } from '@/components/timestamp'
import { API_BASE_URL } from '@/lib'
import {
  createApiToken,
  deleteApiToken,
  listApiTokens,
  type ApiToken,
  type CreateApiTokenResponse,
} from '@/service/api/api-token-api'
import { CopyIcon, PlusIcon, TrashIcon } from '@radix-ui/react-icons'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

function getMcpServerUrl() {
  return `${API_BASE_URL.replace(/\/$/, '')}/api/mcp`
}

function createMcpConfig(token: string) {
  return {
    mcpServers: {
      viberglass: {
        url: getMcpServerUrl(),
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    },
  }
}

function formatMcpConfig(token: string) {
  return JSON.stringify(createMcpConfig(token), null, 2)
}

export function ApiTokensPage() {
  const [tokens, setTokens] = useState<ApiToken[]>([])
  const [loading, setLoading] = useState(true)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [tokenName, setTokenName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [newToken, setNewToken] = useState<CreateApiTokenResponse | null>(null)
  const [revealDialogOpen, setRevealDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [tokenToDelete, setTokenToDelete] = useState<ApiToken | null>(null)
  const [copied, setCopied] = useState(false)
  const [configCopied, setConfigCopied] = useState(false)
  const [mcpConfigExpanded, setMcpConfigExpanded] = useState(false)

  const exampleMcpConfig = formatMcpConfig('<API_TOKEN>')

  useEffect(() => {
    void loadTokens()
  }, [])

  async function loadTokens() {
    setLoading(true)
    try {
      const data = await listApiTokens()
      setTokens(data)
    } catch (error) {
      toast.error('Failed to load API tokens', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setLoading(false)
    }
  }

  function openCreateDialog() {
    setTokenName('')
    setCreateDialogOpen(true)
  }

  async function handleCreate() {
    const name = tokenName.trim()
    if (!name) return

    setIsCreating(true)
    try {
      const result = await createApiToken(name)
      setNewToken(result)
      setCreateDialogOpen(false)
      setRevealDialogOpen(true)
      await loadTokens()
    } catch (error) {
      toast.error('Failed to create API token', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setIsCreating(false)
    }
  }

  function confirmDelete(token: ApiToken) {
    setTokenToDelete(token)
    setDeleteDialogOpen(true)
  }

  async function handleDelete() {
    if (!tokenToDelete) return
    try {
      await deleteApiToken(tokenToDelete.id)
      toast.success('API token revoked')
      setDeleteDialogOpen(false)
      setTokenToDelete(null)
      await loadTokens()
    } catch (error) {
      toast.error('Failed to revoke API token', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  async function copyToken() {
    if (!newToken) return
    try {
      await navigator.clipboard.writeText(newToken.token)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast.success('Token copied to clipboard')
    } catch {
      toast.error('Failed to copy token')
    }
  }

  async function copyMcpConfig(token = '<API_TOKEN>') {
    try {
      await navigator.clipboard.writeText(formatMcpConfig(token))
      setConfigCopied(true)
      setTimeout(() => setConfigCopied(false), 2000)
      toast.success('MCP config copied to clipboard')
    } catch {
      toast.error('Failed to copy MCP config')
    }
  }

  return (
    <>
      <PageMeta title="API Tokens" />
      <div className="flex items-center justify-between">
        <Heading>API Tokens</Heading>
        <Button onClick={openCreateDialog} disabled={loading}>
          <PlusIcon /> Create Token
        </Button>
      </div>
      <Text className="mt-2 max-w-2xl">API tokens allow external MCP clients to authenticate with the platform.</Text>

      <div className="mt-6 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <button
          type="button"
          onClick={() => setMcpConfigExpanded((expanded) => !expanded)}
          className="flex w-full items-start justify-between gap-4 text-left"
          aria-expanded={mcpConfigExpanded}
        >
          <div>
            <Subheading>MCP Server Configuration</Subheading>
            <Text className="mt-1">
              Use this configuration to connect an MCP client to Viberglass. Create an API token, then replace{' '}
              <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-950">
                &lt;API_TOKEN&gt;
              </code>{' '}
              with the token value.
            </Text>
          </div>
          <span className="shrink-0 text-sm text-zinc-500 dark:text-zinc-400">
            {mcpConfigExpanded ? 'Hide' : 'Show'}
          </span>
        </button>

        {mcpConfigExpanded ? (
          <>
            <div className="mt-4 flex justify-end">
              <Button plain onClick={() => copyMcpConfig()} className="shrink-0">
                <CopyIcon /> {configCopied ? 'Copied!' : 'Copy'}
              </Button>
            </div>
            <pre className="mt-4 overflow-x-auto rounded bg-white p-3 text-xs dark:bg-zinc-950">
              <code>{exampleMcpConfig}</code>
            </pre>
          </>
        ) : null}
      </div>

      {loading ? (
        <div className="mt-8 text-center text-sm text-zinc-500">Loading...</div>
      ) : tokens.length === 0 ? (
        <div className="mt-8 text-center text-sm text-zinc-500">No API tokens yet. Create one to get started.</div>
      ) : (
        <Table className="mt-6">
          <TableHead>
            <TableRow>
              <TableHeader>Name</TableHeader>
              <TableHeader>Token</TableHeader>
              <TableHeader>Last Used</TableHeader>
              <TableHeader>Created</TableHeader>
              <TableHeader className="text-right">Actions</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {tokens.map((token) => (
              <TableRow key={token.id}>
                <TableCell className="font-medium">{token.name}</TableCell>
                <TableCell>
                  <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                    {token.tokenPrefix}...
                  </code>
                </TableCell>
                <TableCell>
                  {token.lastUsedAt ? (
                    <Timestamp date={token.lastUsedAt} />
                  ) : (
                    <span className="text-zinc-400">Never</span>
                  )}
                </TableCell>
                <TableCell>
                  <Timestamp date={token.createdAt} />
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    plain
                    onClick={() => confirmDelete(token)}
                    className="text-red-600 hover:text-red-700 dark:text-red-400"
                  >
                    <TrashIcon /> Revoke
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={createDialogOpen} onClose={setCreateDialogOpen}>
        <DialogTitle>Create API Token</DialogTitle>
        <DialogDescription>
          Give your token a descriptive name so you can identify it later. The full token will only be shown once after
          creation.
        </DialogDescription>
        <DialogBody>
          <Fieldset>
            <FieldGroup>
              <Field>
                <Label>Name</Label>
                <Input
                  type="text"
                  placeholder="e.g. Claude Code MCP"
                  value={tokenName}
                  onChange={(e) => setTokenName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleCreate()
                  }}
                  autoFocus
                />
              </Field>
            </FieldGroup>
          </Fieldset>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setCreateDialogOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!tokenName.trim() || isCreating}>
            {isCreating ? 'Creating...' : 'Create Token'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={revealDialogOpen} onClose={setRevealDialogOpen}>
        <DialogTitle>API Token Created</DialogTitle>
        <DialogDescription>Copy this token now. You will not be able to see it again.</DialogDescription>
        <DialogBody>
          <div className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900">
            <Subheading>{newToken?.name}</Subheading>
            <div className="mt-2 flex items-center gap-2">
              <code className="rounded bg-white px-2 py-1.5 font-mono text-xs break-all dark:bg-zinc-950">
                {newToken?.token}
              </code>
              <Button plain onClick={copyToken} className="shrink-0">
                <CopyIcon /> {copied ? 'Copied!' : 'Copy'}
              </Button>
            </div>
          </div>

          {newToken ? (
            <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Subheading>MCP Config</Subheading>
                  <Text className="mt-1">Use this configuration in your MCP client.</Text>
                </div>
                <Button plain onClick={() => copyMcpConfig(newToken.token)} className="shrink-0">
                  <CopyIcon /> {configCopied ? 'Copied!' : 'Copy'}
                </Button>
              </div>
              <pre className="mt-4 overflow-x-auto rounded bg-white p-3 text-xs dark:bg-zinc-950">
                <code>{formatMcpConfig(newToken.token)}</code>
              </pre>
            </div>
          ) : null}
        </DialogBody>
        <DialogActions>
          <Button onClick={() => setRevealDialogOpen(false)}>Done</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteDialogOpen} onClose={setDeleteDialogOpen}>
        <DialogTitle>Revoke API Token</DialogTitle>
        <DialogDescription>
          Are you sure you want to revoke <strong>{tokenToDelete?.name}</strong>? This action cannot be undone.
        </DialogDescription>
        <DialogActions>
          <Button plain onClick={() => setDeleteDialogOpen(false)}>
            Cancel
          </Button>
          <Button color="red" onClick={handleDelete}>
            Revoke
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
