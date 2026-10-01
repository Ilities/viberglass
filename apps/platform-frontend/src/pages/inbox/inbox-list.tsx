import { Button } from '@/components/button'
import { Timestamp } from '@/components/timestamp'
import { taskPath } from '@/lib/taskPath'
import { updateInboxItem } from '@/service/api/inbox-api'
import { INBOX_GROUPS, type InboxGroup, type InboxItem } from '@viberglass/types'
import clsx from 'clsx'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

const GROUP_TITLE: Record<InboxGroup, string> = {
  questions: 'Questions for you',
  reviews: 'Review requests',
  mentions: 'Mentions',
  failures: 'Failures you own',
  updates: 'Updates on tasks you follow',
}

const SNOOZE_HOURS = 24

interface InboxListProps {
  items: InboxItem[]
  showingDone: boolean
  onChanged: (id: string) => void
}

/** The Inbox, grouped as J10 asks. Each item opens its task; done and snooze clear it. */
export function InboxList({ items, showingDone, onChanged }: InboxListProps) {
  const navigate = useNavigate()

  async function change(item: InboxItem, update: { read?: boolean; done?: boolean; snoozeHours?: number }, message?: string) {
    try {
      await updateInboxItem(item.id, update)
      onChanged(item.id)
      if (message) toast.success(message)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update the item')
    }
  }

  async function open(item: InboxItem) {
    if (!item.readAt) await updateInboxItem(item.id, { read: true }).catch(() => undefined)
    if (item.task) navigate(taskPath(item.task.spaceSlug, item.task))
  }

  if (items.length === 0) {
    return <p className="py-10 text-center text-sm text-[var(--gray-10)]">{showingDone ? 'Nothing done yet.' : 'You’re all caught up.'}</p>
  }

  return (
    <div className="space-y-8">
      {INBOX_GROUPS.map((group) => {
        const inGroup = items.filter((item) => item.group === group)
        if (inGroup.length === 0) return null
        return (
          <section key={group} aria-label={GROUP_TITLE[group]}>
            <h2 className="text-[11px] font-semibold tracking-[0.12em] text-[var(--gray-10)] uppercase">
              {GROUP_TITLE[group]} · {inGroup.length}
            </h2>
            <ul className="mt-2 divide-y divide-[var(--gray-5)] rounded-lg border border-[var(--gray-5)]">
              {inGroup.map((item) => (
                <li key={item.id} className="flex items-center gap-4 px-4 py-3">
                  <span aria-hidden className={clsx('size-2 shrink-0 rounded-full', item.readAt ? 'bg-transparent' : 'bg-[var(--accent-9)]')} />
                  <button type="button" onClick={() => void open(item)} className="min-w-0 flex-1 text-left">
                    <span className={clsx('block text-sm', item.readAt ? 'text-[var(--gray-11)]' : 'font-medium text-[var(--gray-12)]')}>
                      {item.text}
                    </span>
                    <span className="mt-0.5 block text-xs text-[var(--gray-10)]">
                      {item.task && <span className="font-mono">{item.task.key} · </span>}
                      <Timestamp date={item.createdAt} />
                    </span>
                  </button>
                  {!showingDone && (
                    <span className="flex shrink-0 gap-1">
                      <Button plain onClick={() => void change(item, { snoozeHours: SNOOZE_HOURS }, 'Snoozed until tomorrow')}>
                        Snooze
                      </Button>
                      <Button outline onClick={() => void change(item, { done: true })}>
                        Done
                      </Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
