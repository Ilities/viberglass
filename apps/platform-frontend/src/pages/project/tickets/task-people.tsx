import { Button } from '@/components/button'
import { Fact, FactList } from '@/components/fact-list'
import { Select } from '@/components/select'
import { useAuth } from '@/context/auth-context'
import { addParticipant, removeParticipant, setTaskOwner } from '@/service/api/participant-api'
import { getPeopleDirectory, type Person } from '@/service/api/user-api'
import { RUNNER_ROLES } from '@viberglass/types'
import { useEffect, useState } from 'react'
import { withRole, type TaskParticipants } from './use-task-participants'

/** Who asked for the task, who owns it and who reviews it; those who assign people change them here. */
export function TaskPeople({ taskId, people: { participants, change } }: { taskId: string; people: TaskParticipants }) {
  const { user } = useAuth()
  const [directory, setDirectory] = useState<Person[]>([])
  const canAssign = Boolean(user?.role && RUNNER_ROLES.includes(user.role))

  useEffect(() => {
    if (canAssign)
      getPeopleDirectory()
        .then(setDirectory)
        .catch(() => undefined)
  }, [canAssign])

  if (!participants) return null

  const owner = withRole(participants, 'owner')[0]
  const requester = withRole(participants, 'requester')[0]
  const reviewers = withRole(participants, 'reviewer')
  const watchers = withRole(participants, 'watcher')
  const notReviewing = directory.filter((person) => !reviewers.some((reviewer) => reviewer.userId === person.id))

  return (
    <FactList title="People">
      <Fact label="Requester">{requester?.name ?? '—'}</Fact>
      <Fact label="Owner">
        {canAssign && directory.length > 0 ? (
          <Select
            aria-label="Owner"
            value={owner?.userId ?? ''}
            placeholder="Nobody yet"
            onChange={(userId) => userId && void change(() => setTaskOwner(taskId, userId))}
          >
            {directory.map((person) => (
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
        {watchers.length === 0 ? 'Nobody' : watchers.map((watcher) => watcher.name).join(', ')}
      </Fact>
    </FactList>
  )
}

/** Following the task on Home, or not. Viewers only read, so they can't. */
export function WatchButton({
  taskId,
  people: { participants, change },
}: {
  taskId: string
  people: TaskParticipants
}) {
  const { user } = useAuth()
  if (!participants || !user || user.role === 'viewer') return null
  const watching = withRole(participants, 'watcher').some((watcher) => watcher.userId === user.id)
  return (
    <Button
      outline
      aria-pressed={watching}
      onClick={() =>
        void change(() =>
          watching ? removeParticipant(taskId, user.id, 'watcher') : addParticipant(taskId, user.id, 'watcher')
        )
      }
    >
      {watching ? 'Stop watching' : 'Watch'}
    </Button>
  )
}
