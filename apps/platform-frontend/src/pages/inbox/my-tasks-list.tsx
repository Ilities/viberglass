import { Link } from '@/components/link'
import { taskPath } from '@/lib/taskPath'
import { MY_TASK_GROUPS, type MyTask, type MyTaskGroup } from '@viberglass/types'

const GROUP_TITLE: Record<MyTaskGroup, string> = {
  waiting_on_me: 'Waiting on you',
  agent_working: 'Agent working',
  waiting_on_others: 'Waiting on others',
  done: 'Done',
}

const ROLE_LABEL = { requester: 'you asked', owner: 'you own it', reviewer: 'you review', watcher: 'you watch' } as const

/** The tasks you asked for, own or review, by whose move it is (J10). */
export function MyTasksList({ tasks }: { tasks: MyTask[] }) {
  if (tasks.length === 0) {
    return <p className="py-10 text-center text-sm text-[var(--gray-10)]">No tasks yet. Tasks you ask for, own or review show up here.</p>
  }
  return (
    <div className="space-y-8">
      {MY_TASK_GROUPS.map((group) => {
        const inGroup = tasks.filter((task) => task.group === group)
        if (inGroup.length === 0) return null
        return (
          <section key={group} aria-label={GROUP_TITLE[group]}>
            <h2 className="text-[11px] font-semibold tracking-[0.12em] text-[var(--gray-10)] uppercase">
              {GROUP_TITLE[group]} · {inGroup.length}
            </h2>
            <ul className="mt-2 divide-y divide-[var(--gray-5)] rounded-lg border border-[var(--gray-5)]">
              {inGroup.map((task) => (
                <li key={task.id} className="flex items-baseline justify-between gap-4 px-4 py-3 text-sm">
                  <Link href={taskPath(task.spaceSlug, task)} className="min-w-0 truncate text-[var(--gray-12)] hover:underline">
                    <span className="mr-2 font-mono text-xs text-[var(--gray-10)]">{task.key}</span>
                    {task.title}
                  </Link>
                  <span className="shrink-0 text-xs text-[var(--gray-10)]">{task.roles.map((role) => ROLE_LABEL[role]).join(', ')}</span>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
