import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { PageMeta } from '@/components/page-meta'
import { weekLine } from './output-text'
import { OutputsBrowser } from './outputs-browser'

/** Everything agents and people made across the spaces you see: artifacts, app releases and changes in preview. */
export function OutputsPage() {
  return (
    <>
      <PageMeta title="Outputs" />
      <OutputsBrowser
        header={({ toolbar, summary }) => (
          <PageHeader title="Outputs" description={summary ? weekLine(summary.week) : undefined} actions={toolbar} />
        )}
        empty={
          <EmptyState
            title="Nothing made yet"
            description="Documents, presentations and data from Files spaces, and apps from App spaces, show up here as agents make them."
          />
        }
      />
    </>
  )
}
