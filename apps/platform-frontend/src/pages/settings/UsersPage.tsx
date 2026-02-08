import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Field, FieldGroup, Label } from '@/components/fieldset'
import { Heading, Subheading } from '@/components/heading'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { Text } from '@/components/text'
import { useAuth } from '@/context/auth-context'
import { createUser, getUsers, type ManagedUser, type UserRole, updateUserRole } from '@/service/api/user-api'
import { type FormEvent, useEffect, useMemo, useState } from 'react'

const DEFAULT_ROLE: UserRole = 'member'

function formatDate(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Unknown'
  return parsed.toLocaleDateString()
}

function roleBadgeColor(role: UserRole): 'blue' | 'zinc' {
  return role === 'admin' ? 'blue' : 'zinc'
}

export function UsersPage() {
  const { user } = useAuth()
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null)

  const isAdmin = user?.role === 'admin'
  const adminCount = useMemo(() => users.filter((entry) => entry.role === 'admin').length, [users])

  async function loadUsers() {
    try {
      const data = await getUsers()
      setUsers(data)
      setLoadError(null)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to load users')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!isAdmin) {
      setIsLoading(false)
      return
    }

    void loadUsers()
  }, [isAdmin])

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    setSuccessMessage(null)
    setIsSubmitting(true)

    const formData = new FormData(event.currentTarget)
    const name = String(formData.get('name') ?? '').trim()
    const email = String(formData.get('email') ?? '').trim()
    const password = String(formData.get('password') ?? '')
    const role = (String(formData.get('role') ?? DEFAULT_ROLE) as UserRole) || DEFAULT_ROLE

    if (!name || !email || !password) {
      setFormError('Name, email, and password are required.')
      setIsSubmitting(false)
      return
    }

    try {
      const created = await createUser({ name, email, password, role })
      setUsers((currentUsers) => [...currentUsers, created])
      setSuccessMessage(`Created ${created.email}. Share the credentials manually.`)
      event.currentTarget.reset()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Failed to create user')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleRoleChange(targetUser: ManagedUser, nextRole: UserRole) {
    if (targetUser.role === nextRole) {
      return
    }

    setFormError(null)
    setSuccessMessage(null)
    setUpdatingUserId(targetUser.id)

    try {
      const updated = await updateUserRole(targetUser.id, nextRole)
      setUsers((currentUsers) =>
        currentUsers.map((entry) => (entry.id === updated.id ? { ...entry, ...updated } : entry))
      )
      setSuccessMessage(`Updated ${updated.email} role to ${updated.role}.`)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Failed to update role')
    } finally {
      setUpdatingUserId(null)
    }
  }

  if (!isAdmin) {
    return (
      <div className="space-y-3 rounded-xl border border-zinc-950/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
        <Heading>Users</Heading>
        <Text>You need an admin role to manage users.</Text>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-zinc-500 dark:text-zinc-400">Loading users...</div>
      </div>
    )
  }

  return (
    <div className="space-y-8 p-6 lg:p-8">
      <div>
        <Heading>User Management</Heading>
        <Text className="mt-2">
          Create user credentials here, then share them directly. Email invites can be added later.
        </Text>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400">
          {loadError}
        </div>
      )}

      {formError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400">
          {formError}
        </div>
      )}

      {successMessage && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700 dark:border-green-900 dark:bg-green-900/20 dark:text-green-400">
          {successMessage}
        </div>
      )}

      <section className="rounded-xl border border-zinc-950/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
        <Subheading>Create User</Subheading>
        <form className="mt-5" onSubmit={handleCreateUser}>
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <Field>
              <Label>Name</Label>
              <Input name="name" autoComplete="name" required />
            </Field>
            <Field>
              <Label>Email</Label>
              <Input name="email" type="email" autoComplete="email" required />
            </Field>
            <Field>
              <Label>Password</Label>
              <Input name="password" type="password" minLength={8} autoComplete="new-password" required />
            </Field>
            <Field>
              <Label>Role</Label>
              <Select name="role" defaultValue={DEFAULT_ROLE} required>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </Select>
            </Field>
          </FieldGroup>
          <div className="mt-5">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating user...' : 'Create user'}
            </Button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-zinc-950/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
        <Subheading>Team Members</Subheading>
        <div className="mt-4">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Name</TableHeader>
                <TableHeader>Email</TableHeader>
                <TableHeader>Role</TableHeader>
                <TableHeader>Change Role</TableHeader>
                <TableHeader>Created</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{entry.name}</TableCell>
                  <TableCell>{entry.email}</TableCell>
                  <TableCell>
                    <Badge color={roleBadgeColor(entry.role)}>{entry.role}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="max-w-36">
                      <Select
                        value={entry.role}
                        onChange={(value) => void handleRoleChange(entry, value as UserRole)}
                        disabled={updatingUserId === entry.id}
                      >
                        <option value="member" disabled={entry.role === 'admin' && adminCount <= 1}>
                          member
                        </option>
                        <option value="admin">admin</option>
                      </Select>
                    </div>
                  </TableCell>
                  <TableCell>{formatDate(entry.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  )
}
