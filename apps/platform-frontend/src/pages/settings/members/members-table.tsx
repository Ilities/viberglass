import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Subheading } from '@/components/heading'
import { Select } from '@/components/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { ROLE_LABEL } from '@/lib/roleCopy'
import {
  createResetLink,
  deactivateUser,
  reactivateUser,
  updateUserRole,
  type ManagedUser,
} from '@/service/api/user-api'
import { isWorkspaceRole, WORKSPACE_ROLES } from '@viberglass/types'
import { useState } from 'react'
import { CopyLink } from './copy-link'

interface MembersTableProps {
  users: ManagedUser[]
  currentUserId: string | undefined
  onChanged: (user: ManagedUser) => void
  onError: (message: string) => void
}

export function MembersTable({ users, currentUserId, onChanged, onError }: MembersTableProps) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [resetLink, setResetLink] = useState<{ name: string; path: string } | null>(null)
  const activeAdmins = users.filter((entry) => entry.role === 'admin' && !entry.deactivatedAt).length

  async function run(user: ManagedUser, action: () => Promise<void>) {
    setBusyId(user.id)
    try {
      await action()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusyId(null)
    }
  }

  const isLastAdmin = (user: ManagedUser) => user.role === 'admin' && !user.deactivatedAt && activeAdmins <= 1

  return (
    <section className="rounded-xl border border-zinc-950/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
      <Subheading>People</Subheading>
      {resetLink && (
        <div className="mt-4">
          <CopyLink
            path={resetLink.path}
            note={`Send this to ${resetLink.name}. It sets a new password, works once, for 24 hours, and is shown only now.`}
          />
        </div>
      )}
      <Table className="mt-4">
        <TableHead>
          <TableRow>
            <TableHeader>Name</TableHeader>
            <TableHeader>Email</TableHeader>
            <TableHeader>Role</TableHeader>
            <TableHeader />
          </TableRow>
        </TableHead>
        <TableBody>
          {users.map((entry) => {
            const isSelf = entry.id === currentUserId
            const busy = busyId === entry.id
            return (
              <TableRow key={entry.id}>
                <TableCell>
                  <span className="flex items-center gap-2">
                    {entry.name}
                    {entry.deactivatedAt && <Badge color="zinc">Deactivated</Badge>}
                  </span>
                </TableCell>
                <TableCell>{entry.email}</TableCell>
                <TableCell>
                  <div className="max-w-36">
                    <Select
                      aria-label={`Role for ${entry.name}`}
                      value={entry.role}
                      disabled={busy || isLastAdmin(entry)}
                      onChange={(value) =>
                        isWorkspaceRole(value) &&
                        value !== entry.role &&
                        void run(entry, async () => onChanged(await updateUserRole(entry.id, value)))
                      }
                    >
                      {WORKSPACE_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABEL[role]}
                        </option>
                      ))}
                    </Select>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  {!isSelf && (
                    <span className="flex justify-end gap-2">
                      {!entry.deactivatedAt && (
                        <Button
                          plain
                          disabled={busy}
                          onClick={() =>
                            void run(entry, async () => setResetLink({ name: entry.name, path: await createResetLink(entry.id) }))
                          }
                        >
                          Reset link
                        </Button>
                      )}
                      {entry.deactivatedAt ? (
                        <Button plain disabled={busy} onClick={() => void run(entry, async () => onChanged(await reactivateUser(entry.id)))}>
                          Reactivate
                        </Button>
                      ) : (
                        <Button
                          plain
                          disabled={busy || isLastAdmin(entry)}
                          onClick={() => void run(entry, async () => onChanged(await deactivateUser(entry.id)))}
                        >
                          Deactivate
                        </Button>
                      )}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </section>
  )
}
