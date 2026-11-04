import { Button } from '@/components/button'
import { Subheading } from '@/components/heading'
import { Input } from '@/components/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { Text } from '@/components/text'
import { ROLE_LABEL } from '@/lib/roleCopy'
import { CopyLink } from '@/pages/settings/members/copy-link'
import { addAppAccess, cancelAppInvite, getAppAccess, removeAppAccess } from '@/service/api/app-api'
import type { AppAccessList } from '@viberglass/types'
import { useCallback, useEffect, useState, type FormEvent } from 'react'

type Notice = { kind: 'invited'; email: string; path: string; emailed: boolean } | { kind: 'text'; text: string }

/** The app's access list, for maintainers: people beyond the space who may open it. */
export function AppAccess({ projectId }: { projectId: string }) {
  const [list, setList] = useState<AppAccessList | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setList(await getAppAccess(projectId))
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Couldn't load who can open the app")
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  async function run(key: string, change: () => Promise<AppAccessList>) {
    setBusy(key)
    setError(null)
    try {
      setList(await change())
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : "Couldn't change who can open the app")
    } finally {
      setBusy(null)
    }
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const email = String(new FormData(form).get('email') ?? '').trim()
    if (!email) return
    setNotice(null)
    await run('add', async () => {
      const addition = await addAppAccess(projectId, email)
      form.reset()
      if (addition.kind === 'invited') {
        setNotice({ kind: 'invited', email, path: addition.invitePath, emailed: addition.emailed })
      } else if (addition.kind === 'added_to_invite') {
        setNotice({ kind: 'text', text: `${email} already has an open invite. They can open the app once they accept it.` })
      }
      return addition.list
    })
  }

  const empty = list && list.people.length === 0 && list.invites.length === 0

  return (
    <section className="mt-8 border-t border-[var(--gray-5)] pt-4">
      <Subheading>Who can open it</Subheading>
      <Text className="mt-1">
        Everyone who can see this space can open the app. Add anyone else by email; people without an account get an invite to use
        only this app.
      </Text>

      <form className="mt-4 flex max-w-lg gap-3" onSubmit={(event) => void add(event)}>
        <Input name="email" type="email" aria-label="Email" placeholder="name@example.com" autoComplete="off" required />
        <Button type="submit" color="brand" disabled={busy === 'add'}>
          {busy === 'add' ? 'Adding…' : 'Add'}
        </Button>
      </form>

      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {notice?.kind === 'text' && <p className="mt-3 text-sm text-[var(--gray-11)]">{notice.text}</p>}
      {notice?.kind === 'invited' && (
        <div className="mt-4 max-w-2xl">
          <CopyLink
            path={notice.path}
            note={
              notice.emailed
                ? `Emailed to ${notice.email}. You can also send this link yourself: it works once, for 7 days, and is shown only now.`
                : `Send this link to ${notice.email}. It works once, for 7 days, and is shown only now. Email isn't set up, so Viberglass doesn't send it for you.`
            }
          />
        </div>
      )}

      {empty && <Text className="mt-4">Nobody else yet.</Text>}
      {list && !empty && (
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
            {list.people.map((person) => (
              <TableRow key={person.userId}>
                <TableCell>{person.name}</TableCell>
                <TableCell>{person.email}</TableCell>
                <TableCell>{ROLE_LABEL[person.workspaceRole]}</TableCell>
                <TableCell className="text-right">
                  <Button
                    plain
                    disabled={busy === person.userId}
                    onClick={() => void run(person.userId, () => removeAppAccess(projectId, person.userId))}
                  >
                    Remove
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {list.invites.map((invite) => (
              <TableRow key={invite.inviteId}>
                <TableCell className="text-[var(--gray-10)]">Invited</TableCell>
                <TableCell>{invite.email}</TableCell>
                <TableCell className="text-[var(--gray-10)]">Until {new Date(invite.expiresAt).toLocaleDateString()}</TableCell>
                <TableCell className="text-right">
                  <Button
                    plain
                    disabled={busy === invite.inviteId}
                    onClick={() => void run(invite.inviteId, () => cancelAppInvite(projectId, invite.inviteId))}
                  >
                    Cancel invite
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  )
}
