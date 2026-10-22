import { Alert, AlertActions, AlertBody, AlertDescription, AlertTitle } from '@/components/alert'
import { Button } from '@/components/button'
import type React from 'react'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  description: React.ReactNode
  confirmLabel: string
  onConfirm: () => void
  onClose: () => void
  body?: React.ReactNode
  confirmingLabel?: string
  destructive?: boolean
  isConfirming?: boolean
}

/**
 * The app's one confirmation shape. The confirm button stays disabled while the request is in
 * flight, so a double click can't send it twice.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
  body,
  confirmingLabel,
  destructive = true,
  isConfirming = false,
}: ConfirmDialogProps) {
  return (
    <Alert open={open} onClose={onClose}>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
      {body ? <AlertBody>{body}</AlertBody> : null}
      <AlertActions>
        <Button outline onClick={onClose} disabled={isConfirming}>
          Cancel
        </Button>
        <Button color={destructive ? 'red' : 'brand'} onClick={onConfirm} disabled={isConfirming}>
          {isConfirming ? (confirmingLabel ?? confirmLabel) : confirmLabel}
        </Button>
      </AlertActions>
    </Alert>
  )
}
