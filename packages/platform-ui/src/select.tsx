import { Select as RadixSelect } from '@radix-ui/themes'
import React from 'react'
import { useFieldContext } from './field-context'

type AnyProps = Record<string, unknown>

function isElement(node: React.ReactNode): node is React.ReactElement<AnyProps> {
  return React.isValidElement<AnyProps>(node)
}

type OptionElement = React.ReactElement<React.OptionHTMLAttributes<HTMLOptionElement>, 'option'>

function isOptionElement(node: React.ReactNode): node is OptionElement {
  return React.isValidElement<React.OptionHTMLAttributes<HTMLOptionElement>>(node) && node.type === 'option'
}

function pickAriaAndDataProps(props: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith('aria-') || key.startsWith('data-')) out[key] = value
  }
  return out
}

function convertOptionsToItems(children: React.ReactNode): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (!isElement(child)) return child

    if (child.type === RadixSelect.Item || child.type === RadixSelect.Group || child.type === RadixSelect.Label) {
      return child
    }

    if (isOptionElement(child)) {
      const { value, children: optionChildren, disabled, className, ...rest } = child.props

      const safeExtra = pickAriaAndDataProps(rest as Record<string, unknown>)

      return (
        <RadixSelect.Item value={(value as string) ?? ''} disabled={disabled} className={className} {...safeExtra}>
          {optionChildren}
        </RadixSelect.Item>
      )
    }

    const props = child.props
    if ('children' in props && props.children != null) {
      return React.cloneElement(child, {
        children: convertOptionsToItems(props.children as React.ReactNode),
      })
    }

    return child
  })
}

export function Select({
  value,
  defaultValue,
  onChange,
  children,
  placeholder,
  disabled,
  className,
  invalid,
  name,
  id,
  required,
}: {
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  children: React.ReactNode
  placeholder?: string
  disabled?: boolean
  className?: string
  invalid?: boolean
  name?: string
  id?: string
  required?: boolean
}) {
  const fieldContext = useFieldContext()
  const isDisabled = disabled ?? fieldContext?.disabled
  const isInvalid = invalid
  const describedBy =
    [
      fieldContext?.hasDescription ? fieldContext.descriptionId : null,
      fieldContext?.hasError ? fieldContext.errorId : null,
    ]
      .filter(Boolean)
      .join(' ') || undefined

  const convertedChildren = convertOptionsToItems(children)

  return (
    <span data-slot="control" className={className}>
      <RadixSelect.Root
        value={value}
        defaultValue={defaultValue}
        onValueChange={onChange}
        disabled={isDisabled}
        name={name}
        required={required}
      >
        <RadixSelect.Trigger
          id={id ?? fieldContext?.controlId}
          placeholder={placeholder ?? 'Select...'}
          color={isInvalid ? 'red' : undefined}
          aria-describedby={describedBy}
          style={{ width: '100%' }}
        />
        <RadixSelect.Content>{convertedChildren}</RadixSelect.Content>
      </RadixSelect.Root>
    </span>
  )
}

export function SelectOption({
  children,
  ...props
}: { children: React.ReactNode } & React.ComponentPropsWithoutRef<typeof RadixSelect.Item>) {
  return <RadixSelect.Item {...props}>{children}</RadixSelect.Item>
}

export function SelectGroup({ children, ...props }: React.ComponentPropsWithoutRef<typeof RadixSelect.Group>) {
  return <RadixSelect.Group {...props}>{children}</RadixSelect.Group>
}

export function SelectLabel({ children, ...props }: React.ComponentPropsWithoutRef<typeof RadixSelect.Label>) {
  return <RadixSelect.Label {...props}>{children}</RadixSelect.Label>
}

export function SelectSeparator(props: React.ComponentPropsWithoutRef<typeof RadixSelect.Separator>) {
  return <RadixSelect.Separator {...props} />
}
