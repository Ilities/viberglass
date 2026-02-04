import { Select as RadixSelect } from '@radix-ui/themes'
import clsx from 'clsx'
import type React from 'react'

export function Listbox({
  className,
  placeholder,
  children,
  value,
  defaultValue,
  onChange,
  disabled,
  invalid,
  'aria-label': ariaLabel,
}: {
  className?: string
  placeholder?: React.ReactNode
  children?: React.ReactNode
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  disabled?: boolean
  invalid?: boolean
  'aria-label'?: string
}) {
  return (
    <span data-slot="control" className={className}>
      <RadixSelect.Root
        value={value}
        defaultValue={defaultValue}
        onValueChange={(nextValue) => onChange?.(nextValue)}
        disabled={disabled}
      >
        <RadixSelect.Trigger
          aria-label={ariaLabel}
          aria-invalid={invalid || undefined}
          placeholder={typeof placeholder === 'string' ? placeholder : 'Select...'}
          color={invalid ? 'red' : undefined}
          style={{ width: '100%' }}
        />
        <RadixSelect.Content>{children}</RadixSelect.Content>
      </RadixSelect.Root>
    </span>
  )
}

export function ListboxOption({
  children,
  className,
  ...props
}: { className?: string; children?: React.ReactNode } & Omit<
  React.ComponentPropsWithoutRef<typeof RadixSelect.Item>,
  'className'
>) {
  return (
    <RadixSelect.Item {...props} className={className}>
      {children}
    </RadixSelect.Item>
  )
}

export function ListboxLabel({ className, ...props }: React.ComponentPropsWithoutRef<'span'>) {
  return <span {...props} className={clsx(className, 'truncate')} />
}

export function ListboxDescription({ className, children, ...props }: React.ComponentPropsWithoutRef<'span'>) {
  return (
    <span {...props} className={clsx(className, 'text-zinc-500 dark:text-zinc-400')}>
      {children}
    </span>
  )
}
