import { TextField } from '@radix-ui/themes'
import React, { forwardRef } from 'react'
import { useFieldContext } from './field-context'

export function InputGroup({ children }: React.ComponentPropsWithoutRef<'span'>) {
  return <span data-slot="control">{children}</span>
}

export const Input = forwardRef(function Input(
  {
    className,
    invalid,
    ...props
  }: {
    className?: string
    type?: 'email' | 'number' | 'password' | 'search' | 'tel' | 'text' | 'url' | 'date' | 'datetime-local' | 'month' | 'time' | 'week'
    invalid?: boolean
  } & Omit<React.ComponentPropsWithoutRef<'input'>, 'className' | 'color'>,
  ref: React.ForwardedRef<HTMLInputElement>
) {
  const fieldContext = useFieldContext()
  const disabled = props.disabled ?? fieldContext?.disabled
  const isInvalid = invalid ?? props['aria-invalid'] === true
  const describedBy =
    [
      props['aria-describedby'],
      fieldContext?.hasDescription ? fieldContext.descriptionId : null,
      fieldContext?.hasError ? fieldContext.errorId : null,
    ]
      .filter(Boolean)
      .join(' ') || undefined

  const { defaultValue, value, type, size, ...otherProps } = props
  return (
    <span data-slot="control" className={className}>
      <TextField.Root
        ref={ref}
        color={isInvalid ? 'red' : undefined}
        id={props.id ?? fieldContext?.controlId}
        aria-describedby={describedBy}
        aria-invalid={isInvalid || undefined}
        disabled={disabled}
        className="ui-control-input w-full"
        type={type as React.ComponentProps<typeof TextField.Root>['type']}
        size={size as React.ComponentProps<typeof TextField.Root>['size']}
        defaultValue={typeof defaultValue === 'string' || typeof defaultValue === 'number' ? defaultValue : undefined}
        value={typeof value === 'string' || typeof value === 'number' ? value : undefined}
        {...otherProps}
      />
    </span>
  )
})
