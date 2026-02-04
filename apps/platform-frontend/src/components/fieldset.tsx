import { Text as RadixText } from '@radix-ui/themes'
import clsx from 'clsx'
import type React from 'react'
import { FieldProvider, useFieldContext, useRegisterFieldDescription, useRegisterFieldError } from './field-context'

export function Fieldset({
  className,
  ...props
}: { className?: string } & React.ComponentPropsWithoutRef<'fieldset'>) {
  return (
    <fieldset
      {...props}
      className={clsx(className, '*:data-[slot=text]:mt-1 [&>*+[data-slot=control]]:mt-6')}
    />
  )
}

export function Legend({
  className,
  ...props
}: { className?: string } & React.ComponentPropsWithoutRef<'legend'>) {
  return (
    <legend
      data-slot="legend"
      {...props}
      className={clsx(
        className,
        'text-base/6 font-semibold text-zinc-950 data-disabled:opacity-50 sm:text-sm/6 dark:text-white'
      )}
    />
  )
}

export function FieldGroup({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  return <div data-slot="control" {...props} className={clsx(className, 'space-y-8')} />
}

export function Field({
  className,
  disabled,
  ...props
}: { className?: string; disabled?: boolean } & React.ComponentPropsWithoutRef<'div'>) {
  return (
    <FieldProvider disabled={disabled}>
      <div
        {...props}
        data-disabled={disabled ? '' : undefined}
        className={clsx(
          className,
          '[&>[data-slot=label]+[data-slot=control]]:mt-3',
          '[&>[data-slot=label]+[data-slot=description]]:mt-1',
          '[&>[data-slot=description]+[data-slot=control]]:mt-3',
          '[&>[data-slot=control]+[data-slot=description]]:mt-3',
          '[&>[data-slot=control]+[data-slot=error]]:mt-3',
          '*:data-[slot=label]:font-medium'
        )}
      />
    </FieldProvider>
  )
}

export function Label({ className, ...props }: { className?: string } & Omit<React.ComponentPropsWithoutRef<'label'>, 'color'>) {
  const context = useFieldContext()
  const disabled = context?.disabled
  const htmlFor = props.htmlFor ?? context?.controlId
  const id = props.id ?? context?.labelId

  return (
    <RadixText
      as="label"
      size="2"
      weight="medium"
      data-slot="label"
      {...props}
      id={id}
      htmlFor={htmlFor}
      data-disabled={disabled ? '' : undefined}
      className={clsx(className, 'select-none data-disabled:opacity-50')}
    />
  )
}

export function Description({
  className,
  ...props
}: { className?: string } & Omit<React.ComponentPropsWithoutRef<'p'>, 'color'>) {
  const context = useFieldContext()
  useRegisterFieldDescription()

  return (
    <RadixText
      as="p"
      size="2"
      color="gray"
      data-slot="description"
      {...props}
      id={props.id ?? context?.descriptionId}
      data-disabled={context?.disabled ? '' : undefined}
      className={clsx(className, 'data-disabled:opacity-50')}
    />
  )
}

export function ErrorMessage({
  className,
  ...props
}: { className?: string } & Omit<React.ComponentPropsWithoutRef<'p'>, 'color'>) {
  const context = useFieldContext()
  useRegisterFieldError()

  return (
    <RadixText
      as="p"
      size="2"
      color="red"
      data-slot="error"
      {...props}
      id={props.id ?? context?.errorId}
      data-disabled={context?.disabled ? '' : undefined}
      className={clsx(className, 'data-disabled:opacity-50')}
    />
  )
}
