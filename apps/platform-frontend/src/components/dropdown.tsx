import { DropdownMenu as RadixDropdownMenu } from '@radix-ui/themes'
import clsx from 'clsx'
import React, { JSX } from 'react'
import { Button } from './button'
import { Link } from './link'

export function Dropdown(props: React.ComponentPropsWithoutRef<typeof RadixDropdownMenu.Root>) {
  return <RadixDropdownMenu.Root {...props} />
}

type PropsOf<T extends React.ElementType> = JSX.LibraryManagedAttributes<T, React.ComponentPropsWithoutRef<T>>

type DropdownButtonProps<T extends React.ElementType> = {
  as?: T
} & Omit<PropsOf<T>, 'as'>

export function DropdownButton<T extends React.ElementType = typeof Button>({
  as,
  ...props
}: DropdownButtonProps<T>) {
  const Component = (as ?? Button) as T

  return (
    <RadixDropdownMenu.Trigger>
      <Component {...(props as PropsOf<T>)} />
    </RadixDropdownMenu.Trigger>
  )
}

export function DropdownMenu({
  className,
  ...props
}: { className?: string } & Omit<React.ComponentPropsWithoutRef<typeof RadixDropdownMenu.Content>, 'className'>) {
  return <RadixDropdownMenu.Content className={clsx('ui-menu-content', className)} {...props} />
}

export function DropdownItem({
  className,
  ...props
}: { className?: string } & (
  | ({ href?: never } & React.ButtonHTMLAttributes<HTMLButtonElement>)
  | ({ href: string } & Omit<React.ComponentPropsWithoutRef<typeof Link>, 'className'>)
)) {
  const itemClassName = clsx('ui-menu-item', className)

  if (typeof props.href === 'string') {
    return (
      <RadixDropdownMenu.Item asChild className={itemClassName}>
        <Link {...props} />
      </RadixDropdownMenu.Item>
    )
  }

  const { disabled, type, ...buttonProps } = props as React.ButtonHTMLAttributes<HTMLButtonElement>
  return (
    <RadixDropdownMenu.Item asChild disabled={disabled} className={itemClassName}>
      <button {...buttonProps} type={type ?? 'button'} disabled={disabled} />
    </RadixDropdownMenu.Item>
  )
}

export function DropdownHeader({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  return <div {...props} className={clsx(className, 'px-3 pt-2 pb-1')} />
}

export function DropdownSection({
  className,
  ...props
}: { className?: string } & React.ComponentPropsWithoutRef<typeof RadixDropdownMenu.Group>) {
  return <RadixDropdownMenu.Group {...props} className={className} />
}

export function DropdownHeading({
  className,
  ...props
}: { className?: string } & React.ComponentPropsWithoutRef<typeof RadixDropdownMenu.Label>) {
  return <RadixDropdownMenu.Label {...props} className={className} />
}

export function DropdownDivider({
  className,
  ...props
}: { className?: string } & React.ComponentPropsWithoutRef<typeof RadixDropdownMenu.Separator>) {
  return <RadixDropdownMenu.Separator {...props} className={className} />
}

export function DropdownLabel({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  return <div {...props} data-slot="label" className={className} />
}

export function DropdownDescription({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      data-slot="description"
      {...props}
      className={clsx(className, 'text-sm text-zinc-500 dark:text-zinc-400')}
    />
  )
}

export function DropdownShortcut({
  keys,
  className,
  ...props
}: { keys: string | string[]; className?: string } & React.ComponentPropsWithoutRef<'kbd'>) {
  return (
    <kbd {...props} className={clsx(className, 'flex justify-self-end')}>
      {(Array.isArray(keys) ? keys : keys.split('')).map((char, index) => (
        <kbd
          key={index}
          className={clsx([
            'min-w-[2ch] text-center font-sans capitalize text-zinc-400',
            index > 0 && char.length > 1 && 'pl-1',
          ])}
        >
          {char}
        </kbd>
      ))}
    </kbd>
  )
}
