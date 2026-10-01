import { Heading } from '@/components/heading'
import { PageMeta } from '@/components/page-meta'
import { TabButton } from '@/components/tab-button'
import { getInbox, getMyTasks } from '@/service/api/inbox-api'
import type { InboxItem, MyTask } from '@viberglass/types'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { InboxList } from './inbox-list'
import { MyTasksList } from './my-tasks-list'

type View = 'inbox' | 'done' | 'tasks'

/** "What needs me?" (J10): the Inbox, its done items, and My tasks. */
export function InboxPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const view: View = searchParams.get('view') === 'tasks' ? 'tasks' : searchParams.get('view') === 'done' ? 'done' : 'inbox'
  const [items, setItems] = useState<InboxItem[] | null>(null)
  const [tasks, setTasks] = useState<MyTask[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setError(null)
    if (view === 'tasks') {
      getMyTasks()
        .then(setTasks)
        .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load your tasks'))
    } else {
      setItems(null)
      getInbox(view === 'done' ? 'done' : 'open')
        .then((inbox) => setItems(inbox.items))
        .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load your Inbox'))
    }
  }, [view])

  const show = (next: View) => setSearchParams(next === 'inbox' ? {} : { view: next })

  return (
    <>
      <PageMeta title="Inbox" />
      <div className="mx-auto max-w-3xl space-y-6 p-6 lg:p-8">
        <Heading>Inbox</Heading>
        <div className="flex gap-2 border-b border-[var(--gray-6)]">
          <TabButton active={view === 'inbox'} onClick={() => show('inbox')}>
            Needs you
          </TabButton>
          <TabButton active={view === 'tasks'} onClick={() => show('tasks')}>
            My tasks
          </TabButton>
          <TabButton active={view === 'done'} onClick={() => show('done')}>
            Done
          </TabButton>
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {view === 'tasks'
          ? tasks && <MyTasksList tasks={tasks} />
          : items && (
              <InboxList
                items={items}
                showingDone={view === 'done'}
                onChanged={(id) => setItems((current) => current?.filter((item) => item.id !== id) ?? null)}
              />
            )}
      </div>
    </>
  )
}
