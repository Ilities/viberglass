'use client'

import { TextArea as RadixTextArea } from '@radix-ui/themes'
import React, { forwardRef } from 'react'
import { useFieldContext } from './field-context'

export const Textarea = forwardRef(function Textarea(
  {
    className,
    resizable = true,
    invalid,
    ...props
  }: { className?: string; resizable?: boolean; invalid?: boolean } & Omit<
    React.ComponentPropsWithoutRef<'textarea'>,
    'className'
  >,
  ref: React.ForwardedRef<HTMLTextAreaElement>
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
      <RadixTextArea
        ref={ref}
        color={isInvalid ? 'red' : undefined}
        resize={resizable ? 'vertical' : 'none'}
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
