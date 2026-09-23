import { Button } from '@/components/button'
import { failureGuidance } from '@/components/failure-guidance'
import { Subheading } from '@/components/heading'
import { useAuth } from '@/context/auth-context'
import { CrossCircledIcon } from '@radix-ui/react-icons'
import type { JobFailure } from '@viberglass/types'

interface JobFailurePanelProps {
  failure?: JobFailure
  technicalDetail: string
  project: string
  ticketId: string | null
}

/** Why a run failed and what this person can do about it. */
export function JobFailurePanel({ failure, technicalDetail, project, ticketId }: JobFailurePanelProps) {
  const { user } = useAuth()
  const guidance = failureGuidance(failure, user?.role === 'admin', project)
  const ticketHref = ticketId ? `/project/${project}/tickets/${ticketId}` : null

  return (
    <div className="app-frame rounded-lg border-red-200 p-6 dark:border-red-500/30">
      <Subheading className="mb-4 flex items-center gap-2 text-red-600">
        <CrossCircledIcon className="h-5 w-5" />
        {guidance.title}
      </Subheading>
      <div className="rounded bg-red-50 p-4 text-sm text-red-900 dark:bg-red-500/10 dark:text-red-100">
        <p className="font-medium">{guidance.summary}</p>
        <p className="mt-2 text-xs text-red-800/80 dark:text-red-200/80">{guidance.nextStep}</p>
        <div className="mt-3 flex gap-2">
          {guidance.fix ? (
            <Button href={guidance.fix.href} outline>
              {guidance.fix.label}
            </Button>
          ) : null}
          {ticketHref ? (
            <Button href={ticketHref} plain>
              {guidance.canRetry ? 'Try again from the task' : 'Return to task'}
            </Button>
          ) : null}
        </div>
        <details className="mt-4 border-t border-red-200 pt-3 dark:border-red-900/60">
          <summary className="cursor-pointer text-xs font-medium">Technical details</summary>
          <pre className="mt-2 overflow-auto text-xs whitespace-pre-wrap">{technicalDetail}</pre>
        </details>
      </div>
    </div>
  )
}
