import { TextField } from '@radix-ui/themes'
import React, { forwardRef } from 'react'
import { useFieldContext } from './field-context'

const dateTypes = ['date', 'datetime-local', 'month', 'time', 'week']
type DateType = (typeof dateTypes)[number]

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
    type?: 'email' | 'number' | 'password' | 'search' | 'tel' | 'text' | 'url' | DateType
    invalid?: boolean
  } & Omit<React.ComponentPropsWithoutRef<'input'>, 'className'>,
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

  return (
    <span data-slot="control">
      <TextField.Root
        ref={ref}
        color={isInvalid ? 'red' : undefined}
        id={props.id ?? fieldContext?.controlId}
        aria-describedby={describedBy}
        aria-invalid={isInvalid || undefined}
        disabled={disabled}
        className={className}
        {...props}
      />
    </span>
  )
})
