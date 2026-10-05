import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@/components/dialog'
import { Description, Field, FieldGroup, Fieldset, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { Textarea } from '@/components/textarea'
import { saveMcpServer } from '@/service/api/mcp-server-api'
import type { Secret } from '@/service/api/secret-api'
import type { McpServer } from '@viberglass/types'
import { PlusIcon, TrashIcon } from '@radix-ui/react-icons'
import { formStateOf, inputOf, newHeaderRow, type HeaderRow, type McpServerFormState } from './mcpServerForm'

// The select can't hold an empty value, so "no secret yet" needs a value of its own.
const NO_SECRET = 'none'

interface McpServerDialogProps {
  open: boolean
  /** The server being edited; absent when approving a new one. */
  server?: McpServer
  secrets: Secret[]
  onClose: () => void
  onSaved: (server: McpServer) => void
}

function HeaderRowFields({
  row,
  secrets,
  onChange,
  onRemove,
}: {
  row: HeaderRow
  secrets: Secret[]
  onChange: (changes: Partial<HeaderRow>) => void
  onRemove: () => void
}) {
  return (
    <div className="grid grid-cols-1 gap-2 rounded-lg border border-zinc-950/10 p-3 sm:grid-cols-[1fr_9rem_auto] dark:border-white/10">
      <Input aria-label="Header name" value={row.name} onChange={(event) => onChange({ name: event.target.value })} placeholder="Authorization" className="font-mono" />
      <Select aria-label="Header value from" value={row.kind} onChange={(value) => onChange({ kind: value === 'value' ? 'value' : 'secret' })}>
        <option value="secret">A secret</option>
        <option value="value">Plain text</option>
      </Select>
      <Button plain onClick={onRemove} aria-label="Remove header">
        <TrashIcon className="h-4 w-4" />
      </Button>
      {row.kind === 'secret' ? (
        <div className="grid grid-cols-[8rem_1fr] gap-2 sm:col-span-3">
          <Input aria-label="Prefix" value={row.prefix} onChange={(event) => onChange({ prefix: event.target.value })} placeholder="Bearer " className="font-mono" />
          <Select aria-label="Secret" value={row.secretId || NO_SECRET} onChange={(value) => onChange({ secretId: value === NO_SECRET ? '' : value })}>
            <option value={NO_SECRET}>Pick a secret…</option>
            {secrets.map((secret) => (
              <option key={secret.id} value={secret.id}>
                {secret.name}
              </option>
            ))}
          </Select>
        </div>
      ) : (
        <Input aria-label="Header value" value={row.value} onChange={(event) => onChange({ value: event.target.value })} className="font-mono sm:col-span-3" />
      )}
    </div>
  )
}

/** Approves an MCP server for the workspace, or changes one. */
export function McpServerDialog({ open, server, secrets, onClose, onSaved }: McpServerDialogProps) {
  const [form, setForm] = useState<McpServerFormState>(formStateOf(server))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setForm(formStateOf(server))
  }, [open, server])

  function changeRow(key: string, changes: Partial<HeaderRow>) {
    setForm((previous) => ({ ...previous, headers: previous.headers.map((row) => (row.key === key ? { ...row, ...changes } : row)) }))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const { input, error } = inputOf(form)
    if (!input) {
      toast.error(error)
      return
    }
    setSaving(true)
    try {
      onSaved(await saveMcpServer(input, server?.id))
    } catch (err) {
      toast.error("Couldn't save the MCP server", { description: err instanceof Error ? err.message : undefined })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={() => !saving && onClose()} size="xl">
      <form onSubmit={handleSubmit}>
        <DialogTitle>{server ? 'Edit MCP server' : 'Approve an MCP server'}</DialogTitle>
        <DialogDescription>
          A remote server the agent connects to over HTTP. Runners pick from the approved servers; the agent can call
          every tool the server offers, without asking.
        </DialogDescription>
        <DialogBody>
          <Fieldset>
            <FieldGroup>
              <Field>
                <Label>Name</Label>
                <Description>The agent knows the server&apos;s tools by it. Lowercase letters, digits, - and _.</Description>
                <Input
                  value={form.name}
                  onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value.toLowerCase() }))}
                  placeholder="linear"
                  className="font-mono"
                  required
                />
              </Field>
              <Field>
                <Label>URL</Label>
                <Description>The server&apos;s streamable HTTP endpoint, often ending in /mcp.</Description>
                <Input
                  type="url"
                  value={form.url}
                  onChange={(event) => setForm((previous) => ({ ...previous, url: event.target.value }))}
                  placeholder="https://mcp.linear.app/mcp"
                  required
                />
              </Field>
              <Field>
                <Label>Description</Label>
                <Textarea
                  rows={2}
                  value={form.description}
                  onChange={(event) => setForm((previous) => ({ ...previous, description: event.target.value }))}
                  placeholder="Read and update Linear issues"
                />
              </Field>
              <Field>
                <Label>Headers</Label>
                <Description>
                  Usually an Authorization header with a token from the Secrets page. Use a token that can do only what
                  agents should.
                </Description>
                <div className="mt-3 space-y-2">
                  {form.headers.map((row) => (
                    <HeaderRowFields
                      key={row.key}
                      row={row}
                      secrets={secrets}
                      onChange={(changes) => changeRow(row.key, changes)}
                      onRemove={() => setForm((previous) => ({ ...previous, headers: previous.headers.filter((other) => other.key !== row.key) }))}
                    />
                  ))}
                  <Button outline onClick={() => setForm((previous) => ({ ...previous, headers: [...previous.headers, newHeaderRow()] }))}>
                    <PlusIcon />
                    Add header
                  </Button>
                </div>
              </Field>
            </FieldGroup>
          </Fieldset>
        </DialogBody>
        <DialogActions>
          <Button outline onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button color="brand" type="submit" disabled={saving}>
            {saving ? 'Saving…' : server ? 'Save changes' : 'Approve server'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
