'use client'

import { Checkbox as RadixCheckbox } from '@radix-ui/themes'
import clsx from 'clsx'
import type React from 'react'
import { FieldProvider, useFieldContext } from './field-context'

export function CheckboxGroup({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      data-slot="control"
      {...props}
      className={clsx(
        className,
        'space-y-3',
        'has-data-[slot=description]:space-y-6 has-data-[slot=description]:**:data-[slot=label]:font-medium'
      )}
    />
  )
}

export function CheckboxField({
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

const colorMap = {
  'dark/zinc': 'gray',
  'dark/white': 'gray',
  white: 'gray',
  dark: 'gray',
  zinc: 'gray',
  red: 'red',
  orange: 'orange',
  amber: 'amber',
  yellow: 'yellow',
  lime: 'lime',
  green: 'green',
  emerald: 'teal',
  teal: 'teal',
  cyan: 'cyan',
  sky: 'sky',
  blue: 'blue',
  indigo: 'indigo',
  violet: 'violet',
  purple: 'purple',
  fuchsia: 'plum',
  pink: 'pink',
  rose: 'crimson',
} as const

type Color = keyof typeof colorMap

export function Checkbox({
  color = 'amber',
  className,
  onChange,
  ...props
}: {
  color?: Color
  className?: string
  onChange?: (checked: boolean) => void
} & Omit<React.ComponentPropsWithoutRef<typeof RadixCheckbox>, 'className' | 'onCheckedChange' | 'color'>) {
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
      <RadixCheckbox
        {...props}
        id={props.id ?? fieldContext?.controlId}
        aria-describedby={describedBy}
        disabled={disabled}
        color={colorMap[color] as React.ComponentProps<typeof RadixCheckbox>['color']}
        onCheckedChange={(checked) => onChange?.(checked === true)}
      />
    </span>
  )
}
