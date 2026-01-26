'use client'

import { AlertDialog } from '@radix-ui/themes'
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

export function Alert({
  size = 'md',
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
    <AlertDialog.Root open={open} defaultOpen={defaultOpen} onOpenChange={(nextOpen) => onClose?.(nextOpen)}>
      <AlertDialog.Content maxWidth={sizeMap[size]} className={className}>
        {children}
      </AlertDialog.Content>
    </AlertDialog.Root>
  )
}

export function AlertTitle({ className, ...props }: React.ComponentPropsWithoutRef<typeof AlertDialog.Title>) {
  return <AlertDialog.Title className={className} {...props} />
}

export function AlertDescription({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof AlertDialog.Description>) {
  return <AlertDialog.Description className={clsx(className, 'mt-2')} {...props} />
}

export function AlertBody({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  return <div {...props} className={clsx(className, 'mt-4')} />
}

export function AlertActions({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      {...props}
      className={clsx(
        className,
        'mt-6 flex flex-col-reverse items-center justify-end gap-3 *:w-full sm:mt-4 sm:flex-row sm:*:w-auto'
      )}
    />
  )
}
