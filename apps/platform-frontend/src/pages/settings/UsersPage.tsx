import { Heading } from '@/components/heading'
import { PageMeta } from '@/components/page-meta'
import { Text } from '@/components/text'
import { useAuth } from '@/context/auth-context'
import { getInvites, type Invite } from '@/service/api/invite-api'
import { getProjects } from '@/service/api/project-api'
import { getUsers, type ManagedUser } from '@/service/api/user-api'
import type { Project } from '@viberglass/types'
import { useEffect, useState } from 'react'
import { InviteForm } from './members/invite-form'
import { MembersTable } from './members/members-table'
import { PendingInvites } from './members/pending-invites'

export function UsersPage() {
  const { user } = useAuth()
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [spaces, setSpaces] = useState<Project[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const isAdmin = user?.role === 'admin'

  useEffect(() => {
    if (!isAdmin) {
      setIsLoading(false)
      return
    }
    Promise.all([getUsers(), getInvites(), getProjects(200)])
      .then(([loadedUsers, loadedInvites, loadedSpaces]) => {
        setUsers(loadedUsers)
        setInvites(loadedInvites)
        setSpaces(loadedSpaces)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load members'))
      .finally(() => setIsLoading(false))
  }, [isAdmin])

  if (!isAdmin) {
    return (
      <div className="space-y-3 rounded-xl border border-zinc-950/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
        <Heading>Members</Heading>
        <Text>You need an admin role to manage members.</Text>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-zinc-500 dark:text-zinc-400">Loading members...</div>
      </div>
    )
  }

  return (
    <>
      <PageMeta title="Members" />
      <div className="space-y-8 p-6 lg:p-8">
        <div>
          <Heading>Members</Heading>
          <Text className="mt-2">
            Invite people with a link. Deactivating someone stops their access at once and keeps their name on what they did.
          </Text>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        <InviteForm
          spaces={spaces}
          onInvited={(invite) =>
            setInvites((current) => [invite, ...current.filter((entry) => entry.email !== invite.email)])
          }
        />
        <PendingInvites invites={invites} onRevoked={(id) => setInvites((current) => current.filter((entry) => entry.id !== id))} />
        <MembersTable
          users={users}
          currentUserId={user?.id}
          onChanged={(changed) => {
            setError(null)
            setUsers((current) => current.map((entry) => (entry.id === changed.id ? changed : entry)))
          }}
          onError={setError}
        />
      </div>
    </>
  )
}
