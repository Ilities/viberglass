import { Description, Field, Label } from '@/components/fieldset'
import { Select } from '@/components/select'
import { useAuth } from '@/context/auth-context'
import { getPeopleDirectory, type Person } from '@/service/api/user-api'
import { useEffect, useState } from 'react'

/** Who owns a new task: the space's default owner, else whoever creates it, unless someone else is picked. */
export function OwnerField({ defaultOwnerId }: { defaultOwnerId: string | null }) {
  const { user } = useAuth()
  const [people, setPeople] = useState<Person[]>([])
  const [ownerId, setOwnerId] = useState(defaultOwnerId ?? user?.id ?? '')

  useEffect(() => {
    getPeopleDirectory()
      .then(setPeople)
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    setOwnerId(defaultOwnerId ?? user?.id ?? '')
  }, [defaultOwnerId, user?.id])

  if (people.length === 0) return null

  return (
    <Field>
      <Label>Owner</Label>
      <Description>Who sees this through to done.</Description>
      <Select name="ownerId" value={ownerId} onChange={setOwnerId}>
        {people.map((person) => (
          <option key={person.id} value={person.id}>
            {person.id === user?.id ? `${person.name} (you)` : person.name}
          </option>
        ))}
      </Select>
    </Field>
  )
}
