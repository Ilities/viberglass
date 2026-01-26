'use client'

import { Switch as RadixSwitch } from '@radix-ui/themes'
import clsx from 'clsx'
import type React from 'react'
import { FieldProvider, useFieldContext } from './field-context'

export function SwitchGroup({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      data-slot="control"
      {...props}
      className={clsx(
        className,
        'space-y-3 **:data-[slot=label]:font-normal',
        'has-data-[slot=description]:space-y-6 has-data-[slot=description]:**:data-[slot=label]:font-medium'
      )}
    />
  )
}

export function SwitchField({
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
          'grid grid-cols-[1fr_auto] gap-x-8 gap-y-1 sm:grid-cols-[1fr_auto]',
          '*:data-[slot=control]:col-start-2 *:data-[slot=control]:self-start sm:*:data-[slot=control]:mt-0.5',
          '*:data-[slot=label]:col-start-1 *:data-[slot=label]:row-start-1',
          '*:data-[slot=description]:col-start-1 *:data-[slot=description]:row-start-2',
          'has-data-[slot=description]:**:data-[slot=label]:font-medium'
        )}
      />
    </FieldProvider>
  )
}

const colorMap = {
  'dark/zinc': 'gray',
  'dark/white': 'gray',
  dark: 'gray',
  zinc: 'gray',
  white: 'gray',
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

export function Switch({
  color = 'amber',
  className,
  onChange,
  ...props
}: {
  color?: Color
  className?: string
  onChange?: (checked: boolean) => void
} & Omit<React.ComponentPropsWithoutRef<typeof RadixSwitch>, 'className' | 'onCheckedChange' | 'color' | 'onChange'>) {
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
      <RadixSwitch
        {...props}
        id={props.id ?? fieldContext?.controlId}
        aria-describedby={describedBy}
        disabled={disabled}
        color={colorMap[color] as React.ComponentProps<typeof RadixSwitch>['color']}
        onCheckedChange={(checked) => onChange?.(checked)}
      />
    </span>
  )
}
