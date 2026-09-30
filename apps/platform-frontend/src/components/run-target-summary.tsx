import { getProjectScmConfig } from '@/service/api/project-api'
import { buildFeatureBranchName, type ProjectScmConfig, type Ticket } from '@viberglass/types'
import { useEffect, useState } from 'react'

// These tokens are only known once the run exists, so the branch can't be named before it starts.
const RUN_SPECIFIC_TOKENS = /\{\{\s*(jobId|timestamp)\s*\}\}/

interface RunTargetSummaryProps {
  ticket: Ticket
  clankerId: string | undefined
}

export function describeRunTarget(
  scmConfig: ProjectScmConfig,
  ticket: Pick<Ticket, 'id' | 'externalTicketId'>,
  clankerId: string | undefined
) {
  const template = scmConfig.branchNameTemplate?.trim() || null
  const branch =
    template && RUN_SPECIFIC_TOKENS.test(template)
      ? template
      : buildFeatureBranchName('', ticket.id, ticket.externalTicketId || ticket.id, clankerId, template)
  const repository = scmConfig.sourceRepository
  const pullRequestRepository = scmConfig.pullRequestRepository?.trim() || repository
  const base = scmConfig.pullRequestBaseBranch?.trim() || scmConfig.baseBranch || 'main'
  return { branch, repository, pullRequestRepository, base }
}

export function RunTargetSummary({ ticket, clankerId }: RunTargetSummaryProps) {
  const [scmConfig, setScmConfig] = useState<ProjectScmConfig | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    getProjectScmConfig(ticket.projectId)
      .then((config) => !cancelled && setScmConfig(config))
      .catch(() => !cancelled && setScmConfig(null))
    return () => {
      cancelled = true
    }
  }, [ticket.projectId])

  if (scmConfig === undefined) return null

  return (
    <div>
      <h4 className="text-sm font-medium text-zinc-900 dark:text-white">Where the change goes</h4>
      {scmConfig ? (
        <RunTargetText {...describeRunTarget(scmConfig, ticket, clankerId)} />
      ) : (
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          This space has no repository connected, so the run can't push a branch or open a pull request.
        </p>
      )}
    </div>
  )
}

function RunTargetText({ branch, repository, pullRequestRepository, base }: ReturnType<typeof describeRunTarget>) {
  return (
    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400" data-testid="run-target-summary">
      Pushes branch <code>{branch}</code> to <code>{repository}</code>, then opens a pull request against{' '}
      <code>{base}</code>
      {pullRequestRepository !== repository && (
        <>
          {' '}
          in <code>{pullRequestRepository}</code>
        </>
      )}
      . If an earlier build pushed this branch, the run adds to it.
    </p>
  )
}
