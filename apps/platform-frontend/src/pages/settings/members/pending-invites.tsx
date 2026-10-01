import { Button } from '@/components/button'
import { Subheading } from '@/components/heading'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { Text } from '@/components/text'
import { ROLE_LABEL } from '@/lib/roleCopy'
import { revokeInvite, type Invite } from '@/service/api/invite-api'
import { useState } from 'react'

export function PendingInvites({ invites, onRevoked }: { invites: Invite[]; onRevoked: (id: string) => void }) {
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function revoke(id: string) {
    setRevokingId(id)
    setError(null)
    try {
      await revokeInvite(id)
      onRevoked(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke the invite')
    } finally {
      setRevokingId(null)
    }
  }

  if (invites.length === 0) return null

  return (
    <section className="rounded-xl border border-zinc-950/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
      <Subheading>Pending invites</Subheading>
      <Text className="mt-1">A link can't be shown again. To send a new one, invite the same email again; the old link stops working.</Text>
      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      <Table className="mt-4">
        <TableHead>
          <TableRow>
            <TableHeader>Email</TableHeader>
            <TableHeader>Role</TableHeader>
            <TableHeader>Invited by</TableHeader>
            <TableHeader>Expires</TableHeader>
            <TableHeader />
          </TableRow>
        </TableHead>
        <TableBody>
          {invites.map((invite) => (
            <TableRow key={invite.id}>
              <TableCell>{invite.email}</TableCell>
              <TableCell>{ROLE_LABEL[invite.role]}</TableCell>
              <TableCell>{invite.invitedByName ?? '—'}</TableCell>
              <TableCell>{new Date(invite.expiresAt).toLocaleDateString()}</TableCell>
              <TableCell className="text-right">
                <Button plain disabled={revokingId === invite.id} onClick={() => void revoke(invite.id)}>
                  {revokingId === invite.id ? 'Revoking…' : 'Revoke'}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  )
}
