'use client'

import { RadioGroup as RadixRadioGroup } from '@radix-ui/themes'
import clsx from 'clsx'
import type React from 'react'
import { FieldProvider, useFieldContext } from './field-context'

export function RadioGroup({
  className,
  onChange,
  ...props
}: {
  className?: string
  onChange?: (value: string) => void
} & Omit<React.ComponentPropsWithoutRef<typeof RadixRadioGroup.Root>, 'className' | 'onValueChange'>) {
  return (
    <RadixRadioGroup.Root
      data-slot="control"
      {...props}
      onValueChange={(value) => onChange?.(value)}
      className={clsx(
        className,
        'space-y-3 **:data-[slot=label]:font-normal',
        'has-data-[slot=description]:space-y-6 has-data-[slot=description]:**:data-[slot=label]:font-medium'
      )}
    />
  )
}

export function RadioField({
  className,
  disabled,
  ...props
}: { className?: string; disabled?: boolean } & React.ComponentPropsWithoutRef<'div'>) {
  return (
    <FieldProvider disabled={disabled}>
      <div
        data-slot="field"
        {...props}
        data-disabled={disabled ? '' : undefined}
        className={clsx(
          className,
          'grid grid-cols-[1.125rem_1fr] gap-x-4 gap-y-1 sm:grid-cols-[1rem_1fr]',
          '*:data-[slot=control]:col-start-1 *:data-[slot=control]:row-start-1 *:data-[slot=control]:mt-0.75 sm:*:data-[slot=control]:mt-1',
          '*:data-[slot=label]:col-start-2 *:data-[slot=label]:row-start-1',
          '*:data-[slot=description]:col-start-2 *:data-[slot=description]:row-start-2',
          'has-data-[slot=description]:**:data-[slot=label]:font-medium'
        )}
      />
    </FieldProvider>
  )
}

export function Radio({
  className,
  ...props
}: { className?: string } & Omit<React.ComponentPropsWithoutRef<typeof RadixRadioGroup.Item>, 'className'>) {
  const fieldContext = useFieldContext()
  const disabled = props.disabled ?? fieldContext?.disabled
  const describedBy =
    [
      props['aria-describedby'],
      fieldContext?.hasDescription ? fieldContext.descriptionId : null,
      fieldContext?.hasError ? fieldContext.errorId : null,
    ]
      .filter(Boolean)
      .join(' ') || undefined

  return (
    <span data-slot="control" className={className}>
      <RadixRadioGroup.Item
        {...props}
        id={props.id ?? fieldContext?.controlId}
        aria-describedby={describedBy}
        disabled={disabled}
      />
    </span>
  )
}
