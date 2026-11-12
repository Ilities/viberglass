import { Subheading } from '@/components/heading'
import { Text } from '@/components/text'
import { StatusDot, type CoverStatusTone } from '@/components/covers/app-cover'
import { ListPanel, ListRow } from '@/components/list-panel'
import { taskPath } from '@/lib/taskPath'
import type { AppPreviewState, AppView } from '@viberglass/types'

const STATE: Record<AppPreviewState, { label: string; tone: CoverStatusTone }> = {
  running: { label: 'Running', tone: 'preview' },
  building: { label: 'Building', tone: 'working' },
  starting: { label: 'Starting', tone: 'working' },
  stopping: { label: 'Stopping', tone: 'working' },
  failed: { label: "Couldn't start", tone: 'failed' },
  off: { label: 'Off', tone: 'idle' },
}

/** Tasks' changes running in a preview, each tried and made live from its task. */
export function ChangesInPreview({ spaceSlug, previews, tasks }: { spaceSlug: string; previews: AppView['previews']; tasks: AppView['tasks'] }) {
  if (previews.length === 0) return null
  return (
    <section aria-labelledby="app-previews" className="mt-8 border-t border-[var(--gray-5)] pt-4">
      <Subheading id="app-previews">Changes in preview</Subheading>
      <Text className="mt-1">Try each one and make it live from its task.</Text>
      <ListPanel aria-label="Changes in preview" className="mt-4">
        {previews.map((preview) => {
          const task = tasks[preview.taskId]
          const state = STATE[preview.state]
          return (
            <ListRow
              key={preview.id}
              taskKey={task?.key}
              title={task?.title ?? 'A change'}
              href={taskPath(spaceSlug, { id: preview.taskId, key: task?.key })}
              meta={
                <span className="flex items-center gap-1.5">
                  <StatusDot tone={state.tone} />
                  {state.label}
                  {preview.statusMessage && <span className="truncate text-[var(--gray-10)]">· {preview.statusMessage}</span>}
                </span>
              }
            />
          )
        })}
      </ListPanel>
    </section>
  )
}
