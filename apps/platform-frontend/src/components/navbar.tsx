'use client'

import clsx from 'clsx'
import { LayoutGroup, motion } from 'motion/react'
import React, { forwardRef, useId } from 'react'
import { TouchTarget } from './button'
import { composeEventHandlers, useDataInteraction } from './interaction'
import { Link } from './link'

export function Navbar({ className, ...props }: React.ComponentPropsWithoutRef<'nav'>) {
  return <nav {...props} className={clsx(className, 'flex flex-1 items-center gap-4 py-2.5')} />
}

export function NavbarDivider({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  return <div aria-hidden="true" {...props} className={clsx(className, 'h-6 w-px bg-zinc-950/10 dark:bg-white/10')} />
}

export function NavbarSection({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  let id = useId()

  return (
    <LayoutGroup id={id}>
      <div {...props} className={clsx(className, 'flex items-center gap-3')} />
    </LayoutGroup>
  )
}

export function NavbarSpacer({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  return <div aria-hidden="true" {...props} className={clsx(className, '-ml-4 flex-1')} />
}

export const NavbarItem = forwardRef(function NavbarItem(
  {
    current,
    className,
    children,
    ...props
  }: { current?: boolean; className?: string; children: React.ReactNode } & (
    | ({ href?: never } & React.ButtonHTMLAttributes<HTMLButtonElement>)
    | ({ href: string } & Omit<React.ComponentPropsWithoutRef<typeof Link>, 'className'>)
  ),
  ref: React.ForwardedRef<HTMLAnchorElement | HTMLButtonElement>
) {
  let classes = clsx(
    // Base
    'relative flex min-w-0 items-center gap-3 rounded-lg p-2 text-left text-base/6 font-medium text-zinc-950 sm:text-sm/5 navbar-item',
    // Leading icon/icon-only (Radix icons use stroke)
    '*:data-[slot=icon]:size-6 *:data-[slot=icon]:shrink-0 *:data-[slot=icon]:stroke-zinc-500 sm:*:data-[slot=icon]:size-5',
    // Trailing icon (down chevron or similar)
    '*:not-nth-2:last:data-[slot=icon]:ml-auto *:not-nth-2:last:data-[slot=icon]:size-5 sm:*:not-nth-2:last:data-[slot=icon]:size-4',
    // Avatar
    '*:data-[slot=avatar]:-m-0.5 *:data-[slot=avatar]:size-7 *:data-[slot=avatar]:[--avatar-radius:var(--radius-md)] sm:*:data-[slot=avatar]:size-6',
    // Hover
    'data-hover:bg-zinc-950/5 data-hover:*:data-[slot=icon]:stroke-zinc-950',
    // Active
    'data-active:bg-zinc-950/5 data-active:*:data-[slot=icon]:stroke-zinc-950',
    // Dark mode
    'dark:text-white dark:*:data-[slot=icon]:stroke-zinc-400',
    'dark:data-hover:bg-white/5 dark:data-hover:*:data-[slot=icon]:stroke-white',
    'dark:data-active:bg-white/5 dark:data-active:*:data-[slot=icon]:stroke-white'
  )

  const isLink = typeof props.href === 'string'
  const { dataAttributes, eventHandlers } = useDataInteraction({
    disabled: !isLink ? props.disabled : undefined,
  })

  return (
    <span className={clsx(className, 'relative')}>
      {current && (
        <motion.span
          layoutId="current-indicator"
          className="absolute inset-x-2 -bottom-2.5 h-0.5 rounded-full bg-zinc-950 dark:bg-white"
        />
      )}
      {isLink ? (
        <Link
          {...props}
          className={classes}
          data-current={current ? 'true' : undefined}
          ref={ref as React.ForwardedRef<HTMLAnchorElement>}
        >
          <TouchTarget>{children}</TouchTarget>
        </Link>
      ) : (
        (() => {
          const {
            onPointerEnter,
            onPointerLeave,
            onPointerDown,
            onPointerUp,
            onKeyDown,
            onKeyUp,
            onFocus,
            onBlur,
            disabled,
            type,
            ...buttonProps
          } = props

          return (
            <button
              {...buttonProps}
              {...dataAttributes}
              className={clsx('cursor-default', classes)}
              data-current={current ? 'true' : undefined}
              ref={ref as React.ForwardedRef<HTMLButtonElement>}
              type={type ?? 'button'}
              disabled={disabled}
              onPointerEnter={composeEventHandlers(onPointerEnter, eventHandlers.onPointerEnter)}
              onPointerLeave={composeEventHandlers(onPointerLeave, eventHandlers.onPointerLeave)}
              onPointerDown={composeEventHandlers(onPointerDown, eventHandlers.onPointerDown)}
              onPointerUp={composeEventHandlers(onPointerUp, eventHandlers.onPointerUp)}
              onKeyDown={composeEventHandlers(onKeyDown, eventHandlers.onKeyDown)}
              onKeyUp={composeEventHandlers(onKeyUp, eventHandlers.onKeyUp)}
              onFocus={composeEventHandlers(onFocus, eventHandlers.onFocus)}
              onBlur={composeEventHandlers(onBlur, eventHandlers.onBlur)}
            >
              <TouchTarget>{children}</TouchTarget>
            </button>
          )
        })()
      )}
    </span>
  )
})

export function NavbarLabel({ className, ...props }: React.ComponentPropsWithoutRef<'span'>) {
  return <span {...props} className={clsx(className, 'truncate')} />
}
