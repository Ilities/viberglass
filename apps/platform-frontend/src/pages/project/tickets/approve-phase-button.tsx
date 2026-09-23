import { Alert, AlertActions, AlertDescription, AlertTitle } from '@/components/alert'
import { Button } from '@/components/button'
import { getPhaseDocumentComments } from '@/service/api/ticket-api'
import { CheckCircledIcon } from '@radix-ui/react-icons'
import { useState } from 'react'

interface ApprovalWarnings {
  openComments: number
  runInProgress: boolean
}

function describeWarnings({ openComments, runInProgress }: ApprovalWarnings): string[] {
  const reasons: string[] = []
  if (runInProgress) {
    reasons.push('The agent is still working on this document, so what you approve may change.')
  }
  if (openComments > 0) {
    reasons.push(
      `${openComments} comment${openComments === 1 ? ' is' : 's are'} still unresolved. The agent has not addressed ${openComments === 1 ? 'it' : 'them'} yet.`,
    )
  }
  return reasons
}

/**
 * Approves a phase document, but first warns when approval would skip over
 * open feedback or a run that is still changing the document.
 */
export function ApprovePhaseButton({
  ticketId,
  phase,
  label,
  runInProgress,
  isApproving,
  onApprove,
}: {
  ticketId: string
  phase: 'research' | 'planning'
  label: string
  runInProgress: boolean
  isApproving: boolean
  onApprove: () => void
}) {
  const [warnings, setWarnings] = useState<ApprovalWarnings | null>(null)
  const [isChecking, setIsChecking] = useState(false)

  const handleClick = async () => {
    setIsChecking(true)
    try {
      const comments = await getPhaseDocumentComments(ticketId, phase)
      const found = {
        openComments: comments.filter((comment) => comment.status === 'open').length,
        runInProgress,
      }
      if (found.openComments > 0 || found.runInProgress) {
        setWarnings(found)
        return
      }
    } catch {
      // Comments could not be checked; approval itself is still allowed.
    } finally {
      setIsChecking(false)
    }
    onApprove()
  }

  return (
    <>
      <Button color="green" onClick={() => void handleClick()} disabled={isApproving || isChecking}>
        <CheckCircledIcon className="h-4 w-4" />
        {label}
      </Button>
      <Alert open={warnings !== null} onClose={(open) => !open && setWarnings(null)}>
        <AlertTitle>Approve with open feedback?</AlertTitle>
        <AlertDescription>
          {warnings &&
            describeWarnings(warnings).map((reason) => (
              <span key={reason} className="mb-2 block">
                {reason}
              </span>
            ))}
        </AlertDescription>
        <AlertActions>
          <Button plain onClick={() => setWarnings(null)}>
            Not yet
          </Button>
          <Button
            color="green"
            onClick={() => {
              setWarnings(null)
              onApprove()
            }}
          >
            Approve anyway
          </Button>
        </AlertActions>
      </Alert>
    </>
  )
}
