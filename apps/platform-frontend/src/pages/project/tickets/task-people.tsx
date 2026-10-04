import { TaskParticipationHelp } from '@/components/role-capabilities'
import { Button } from '@/components/button'
import { Fact, FactList } from '@/components/fact-list'
import { Select } from '@/components/select'
import { useAuth } from '@/context/auth-context'
import { addParticipant, getParticipants, removeParticipant, setTaskOwner } from '@/service/api/participant-api'
import { getPeopleDirectory, type Person } from '@/service/api/user-api'
import { RUNNER_ROLES, type TaskParticipant } from '@viberglass/types'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

function names(participants: TaskParticipant[], role: TaskParticipant['role']): TaskParticipant[] {
  return participants.filter((participant) => participant.role === role)
}

/** Who asked for the task, who owns it, who reviews it and who follows it. */
export function TaskPeople({ taskId }: { taskId: string }) {
  const { user } = useAuth()
  const [participants, setParticipants] = useState<TaskParticipant[] | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const canAssign = Boolean(user?.role && RUNNER_ROLES.includes(user.role))
  const canWatch = Boolean(user && user.role !== 'viewer')

  useEffect(() => {
    getParticipants(taskId)
      .then(setParticipants)
      .catch(() => setParticipants([]))
    if (canAssign) getPeopleDirectory().then(setPeople).catch(() => undefined)
  }, [taskId, canAssign])

  async function change(action: () => Promise<TaskParticipant[]>) {
    try {
      setParticipants(await action())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to change the people on this task')
    }
  }

  if (!participants) return null

  const owner = names(participants, 'owner')[0]
  const requester = names(participants, 'requester')[0]
  const reviewers = names(participants, 'reviewer')
  const watchers = names(participants, 'watcher')
  const watching = watchers.some((watcher) => watcher.userId === user?.id)
  const notReviewing = people.filter((person) => !reviewers.some((reviewer) => reviewer.userId === person.id))

  return (
    <FactList title="People">
      <Fact label="Requester">{requester?.name ?? '—'}</Fact>
      <Fact label="Owner">
        {canAssign && people.length > 0 ? (
          <Select
            aria-label="Owner"
            value={owner?.userId ?? ''}
            placeholder="Nobody yet"
            onChange={(userId) => userId && void change(() => setTaskOwner(taskId, userId))}
          >
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </Select>
        ) : (
          (owner?.name ?? 'Nobody yet')
        )}
      </Fact>
      <Fact label="Reviewers">
        <span className="flex flex-col gap-1">
          {reviewers.length === 0 && !canAssign && 'None'}
          {reviewers.map((reviewer) => (
            <span key={reviewer.userId} className="flex items-center justify-between gap-2">
              {reviewer.name}
              {canAssign && (
                <Button plain onClick={() => void change(() => removeParticipant(taskId, reviewer.userId, 'reviewer'))}>
                  Remove
                </Button>
              )}
            </span>
          ))}
          {canAssign && notReviewing.length > 0 && (
            <Select
              aria-label="Add a reviewer"
              value=""
              placeholder="Add a reviewer…"
              onChange={(userId) => userId && void change(() => addParticipant(taskId, userId, 'reviewer'))}
            >
              {notReviewing.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </Select>
          )}
        </span>
      </Fact>
      <Fact label="Watchers">
        <span className="flex flex-col gap-1">
          <span>{watchers.length === 0 ? 'Nobody' : watchers.map((watcher) => watcher.name).join(', ')}</span>
          {canWatch && user && (
            <Button
              plain
              className="self-start px-0"
              onClick={() =>
                void change(() =>
                  watching ? removeParticipant(taskId, user.id, 'watcher') : addParticipant(taskId, user.id, 'watcher')
                )
              }
            >
              {watching ? 'Stop watching' : 'Watch'}
            </Button>
          )}
        </span>
      </Fact>
      <div className="mt-2">
        <TaskParticipationHelp />
      </div>
    </FactList>
  )
}
