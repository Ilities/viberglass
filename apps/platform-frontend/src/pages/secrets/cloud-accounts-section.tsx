import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertActions, AlertDescription, AlertTitle } from '@/components/alert'
import { Button } from '@/components/button'
import { Subheading } from '@/components/heading'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { TextLink } from '@/components/text'
import { deleteModelHostAccount, listModelHostAccounts } from '@/service/api/model-hosting-api'
import { MODEL_HOST_LABELS, type ModelHostAccount } from '@viberglass/types'
import { Pencil1Icon, PlusIcon, TrashIcon } from '@radix-ui/react-icons'
import { CloudAccountDialog } from './cloud-account-dialog'

/** Cloud accounts that open-weight models are deployed to. */
export function CloudAccountsSection() {
  const [accounts, setAccounts] = useState<ModelHostAccount[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ModelHostAccount | undefined>()
  const [removing, setRemoving] = useState<ModelHostAccount | null>(null)

  useEffect(() => {
    listModelHostAccounts()
      .then(setAccounts)
      .catch((error) => toast.error("Couldn't load cloud accounts", { description: error instanceof Error ? error.message : undefined }))
  }, [])

  function open(account?: ModelHostAccount) {
    setEditing(account)
    setDialogOpen(true)
  }

  function saved(account: ModelHostAccount) {
    setAccounts((previous) => [...previous.filter((other) => other.id !== account.id), account].sort((a, b) => a.name.localeCompare(b.name)))
    setDialogOpen(false)
    toast.success(editing ? 'Cloud account saved' : 'Cloud account added')
  }

  async function confirmRemove() {
    if (!removing) return
    try {
      await deleteModelHostAccount(removing.id)
      setAccounts((previous) => previous.filter((account) => account.id !== removing.id))
      toast.success('Cloud account removed')
    } catch (error) {
      toast.error("Couldn't remove the cloud account", { description: error instanceof Error ? error.message : undefined })
    } finally {
      setRemoving(null)
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <Subheading>Cloud accounts</Subheading>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Where <TextLink href="/settings/models">deployed models</TextLink> run and are billed.
          </p>
        </div>
        <Button outline onClick={() => open()}>
          <PlusIcon />
          Add account
        </Button>
      </div>
      {accounts.length > 0 && (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Account</TableHeader>
              <TableHeader>Client ID</TableHeader>
              <TableHeader />
            </TableRow>
          </TableHead>
          <TableBody>
            {accounts.map((account) => (
              <TableRow key={account.id}>
                <TableCell className="font-medium text-zinc-950 dark:text-white">
                  {account.name}
                  <div className="text-xs font-normal text-zinc-500 dark:text-zinc-400">{MODEL_HOST_LABELS[account.host]}</div>
                </TableCell>
                <TableCell className="font-mono text-zinc-500 dark:text-zinc-400">{account.clientId}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    <Button plain onClick={() => open(account)} aria-label={`Edit ${account.name}`}>
                      <Pencil1Icon className="h-4 w-4" />
                    </Button>
                    <Button surface color="red" onClick={() => setRemoving(account)} aria-label={`Remove ${account.name}`}>
                      <TrashIcon className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <CloudAccountDialog open={dialogOpen} account={editing} onClose={() => setDialogOpen(false)} onSaved={saved} />

      <Alert open={removing !== null} onClose={() => setRemoving(null)}>
        <AlertTitle>Remove {removing?.name}?</AlertTitle>
        <AlertDescription>Its stored credentials are deleted. An account with deployments can&apos;t be removed.</AlertDescription>
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
