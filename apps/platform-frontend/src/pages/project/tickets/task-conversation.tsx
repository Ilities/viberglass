import { TabButton } from '@/components/tab-button'
import { useState } from 'react'
import { TaskActivity } from './task-activity'
import { TaskDiscussion } from './task-discussion'

/** The task-wide Discussion and Activity, below the steps (plan §6.2). */
export function TaskConversation({ taskId }: { taskId: string }) {
  const [tab, setTab] = useState<'discussion' | 'activity'>('discussion')
  return (
    <section className="space-y-5">
      <div className="flex gap-2 border-b border-[var(--gray-6)]">
        <TabButton active={tab === 'discussion'} onClick={() => setTab('discussion')}>
          Discussion
        </TabButton>
        <TabButton active={tab === 'activity'} onClick={() => setTab('activity')}>
          Activity
        </TabButton>
      </div>
      {tab === 'discussion' ? <TaskDiscussion taskId={taskId} /> : <TaskActivity taskId={taskId} />}
    </section>
  )
}
