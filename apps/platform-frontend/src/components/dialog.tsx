'use client'

import { Dialog as RadixDialog } from '@radix-ui/themes'
import clsx from 'clsx'
import type React from 'react'

const sizeMap = {
  xs: '300px',
  sm: '384px',
  md: '448px',
  lg: '512px',
  xl: '576px',
  '2xl': '672px',
  '3xl': '768px',
  '4xl': '896px',
  '5xl': '1024px',
}

export function Dialog({
  size = 'lg',
  className,
  children,
  onClose,
  open,
  defaultOpen,
}: {
  size?: keyof typeof sizeMap
  className?: string
  children: React.ReactNode
  onClose?: (open: boolean) => void
  open?: boolean
  defaultOpen?: boolean
}) {
  return (
    <RadixDialog.Root open={open} defaultOpen={defaultOpen} onOpenChange={(nextOpen) => onClose?.(nextOpen)}>
      <RadixDialog.Content maxWidth={sizeMap[size]} className={className}>
        {children}
      </RadixDialog.Content>
    </RadixDialog.Root>
  )
}

export function DialogTitle({ className, ...props }: React.ComponentPropsWithoutRef<typeof RadixDialog.Title>) {
  return <RadixDialog.Title className={className} {...props} />
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof RadixDialog.Description>) {
  return <RadixDialog.Description className={clsx(className, 'mt-2')} {...props} />
}

export function DialogBody({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  return <div {...props} className={clsx(className, 'mt-6')} />
}

export function DialogActions({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      {...props}
      className={clsx(
        className,
        'mt-8 flex flex-col-reverse items-center justify-end gap-3 *:w-full sm:flex-row sm:*:w-auto'
      )}
    />
  )
}
