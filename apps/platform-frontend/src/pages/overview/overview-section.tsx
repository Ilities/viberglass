import { Badge } from '@/components/badge'
import { ListPanel, ListRow, MetaLine } from '@/components/list-panel'
import { SectionHeader } from '@/components/section-header'
import { Timestamp } from '@/components/timestamp'
import { taskPath } from '@/lib/taskPath'
import { turnLine } from '@/pages/home/home-threads'
import type { OverviewTask } from '@viberglass/types'
import { useState } from 'react'
import { attentionBadge } from './overview-metrics'

interface OverviewSectionProps {
  id: string
  title: string
  tasks: OverviewTask[]
  empty: string
  /** Whether each row says who it's waiting for, or what broke, as a badge. */
  badged?: boolean
}

/** One of Overview's lists: each task with where it stands, whose move it is, and since when. */
export function OverviewSection({ id, title, tasks, empty, badged = false }: OverviewSectionProps) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? tasks : tasks.slice(0, 5)
  return (
    <section aria-labelledby={id} className="mb-8">
      <SectionHeader id={id} title={title} />
      {tasks.length === 0 ? (
        <p className="text-sm text-[var(--gray-10)]">{empty}</p>
      ) : (
        <ListPanel>
          {visible.map((entry) => {
            const { task, situation } = entry
            const badge = badged ? attentionBadge(entry) : null
            return (
              <ListRow
                key={task.id}
                label={task.title}
                badge={badge && <Badge color={badge.tone === 'error' ? 'red' : 'amber'}>{badge.text}</Badge>}
                taskKey={task.key}
                title={task.title}
                href={taskPath(task.spaceSlug, task)}
                meta={
                  <MetaLine
                    parts={[
                      situation.label,
                      !badged && turnLine(situation),
                      task.spaceName,
                      <Timestamp key="since" date={situation.since} />,
                    ]}
                  />
                }
              />
            )
          })}
        </ListPanel>
      )}
      {tasks.length > 5 && (
        <button type="button" className="mt-3 text-sm text-[var(--gray-11)] underline" onClick={() => setExpanded((value) => !value)}>
          {expanded ? 'Show less' : `View all ${tasks.length} tasks`}
        </button>
      )}
    </section>
  )
}
