import { RoleCapabilityTable } from '@/components/role-capabilities'
import { Button } from '@/components/button'
import { Label } from '@/components/fieldset'
import { Heading } from '@/components/heading'
import { PageMeta } from '@/components/page-meta'
import { Select } from '@/components/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { Text } from '@/components/text'
import { ROLE_LABEL } from '@/lib/roleCopy'
import { getProjectBySlug } from '@/service/api/project-api'
import { getSpaceMembers, removeSpaceMember, setSpaceMember } from '@/service/api/space-member-api'
import { getPeopleDirectory, type Person } from '@/service/api/user-api'
import { isSpaceRole, type Project, type SpaceMember, type SpaceRole } from '@viberglass/types'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

const SPACE_ROLE_LABEL: Record<SpaceRole, string> = { maintainer: 'Maintainer', member: 'Member' }

export function SpaceMembersPage() {
  const { project: slug = '' } = useParams<{ project: string }>()
  const [project, setProject] = useState<Project | null>(null)
  const [members, setMembers] = useState<SpaceMember[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [adding, setAdding] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getProjectBySlug(slug)
      .then(async (loaded) => {
        setProject(loaded)
        const [loadedMembers, directory] = await Promise.all([getSpaceMembers(loaded.id), getPeopleDirectory()])
        setMembers(loadedMembers)
        setPeople(directory)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load the space'))
  }, [slug])

  const canMaintain = project?.viewerAccess?.canMaintain ?? false

  async function act(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  if (!project) return error ? <Text>{error}</Text> : <Text>Loading…</Text>

  const candidates = people.filter((person) => !members.some((member) => member.userId === person.id))

  return (
    <>
      <PageMeta title={`${project.name} | Members`} />
      <div className="space-y-8">
        <div>
          <Heading>Members</Heading>
          <Text className="mt-2">Maintainers change this space&apos;s settings. Workspace admins maintain every space.</Text>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <section>
          {members.length === 0 ? (
            <Text>Nobody has joined yet{project.isPrivate ? ', so only admins can see it' : ''}.</Text>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Name</TableHeader>
                  <TableHeader>Workspace role</TableHeader>
                  <TableHeader>Space role</TableHeader>
                  <TableHeader />
                </TableRow>
              </TableHead>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.userId}>
                    <TableCell>
                      {member.name}
                      <span className="block text-xs text-zinc-500">{member.email}</span>
                    </TableCell>
                    <TableCell>{ROLE_LABEL[member.workspaceRole]}</TableCell>
                    <TableCell>
                      <div className="max-w-40">
                        <Select
                          aria-label={`Space role for ${member.name}`}
                          value={member.role}
                          disabled={!canMaintain || busy}
                          onChange={(value) =>
                            isSpaceRole(value) &&
                            void act(async () => setMembers(await setSpaceMember(project.id, member.userId, value)))
                          }
                        >
                          <option value="member">{SPACE_ROLE_LABEL.member}</option>
                          <option value="maintainer">{SPACE_ROLE_LABEL.maintainer}</option>
                        </Select>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {canMaintain && (
                        <Button plain disabled={busy} onClick={() => void act(async () => setMembers(await removeSpaceMember(project.id, member.userId)))}>
                          Remove
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>

        {canMaintain && candidates.length > 0 && (
          <section className="flex items-end gap-3">
            <div className="w-72">
              <Label>Add someone</Label>
              <Select aria-label="Add someone" value={adding} onChange={setAdding} placeholder="Choose a person…">
                {candidates.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              disabled={!adding || busy}
              onClick={() =>
                void act(async () => {
                  setMembers(await setSpaceMember(project.id, adding, 'member'))
                  setAdding('')
                })
              }
            >
              Add as member
            </Button>
          </section>
        )}

        <RoleCapabilityTable />
      </div>
    </>
  )
}
