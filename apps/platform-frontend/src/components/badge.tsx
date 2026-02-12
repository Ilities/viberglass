import { Badge as RadixBadge } from '@radix-ui/themes'
import React, { forwardRef } from 'react'
import { Link } from './link'

const colorMap = {
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
  zinc: 'gray',
} as const

type BadgeColor = keyof typeof colorMap
type BadgeProps = { color?: BadgeColor }

export function Badge({ color = 'zinc', className, ...props }: BadgeProps & React.ComponentPropsWithoutRef<'span'>) {
  return <RadixBadge variant="soft" color={colorMap[color]} className={className} {...props} />
}

export const BadgeButton = forwardRef(function BadgeButton(
  {
    color = 'zinc',
    className,
    children,
    ...props
  }: BadgeProps & { className?: string; children: React.ReactNode } & (
      | ({ href?: never } & React.ButtonHTMLAttributes<HTMLButtonElement>)
      | ({ href: string; disabled?: boolean } & Omit<React.ComponentPropsWithoutRef<typeof Link>, 'className'>)
    ),
  ref: React.ForwardedRef<HTMLElement>
) {
  if (typeof props.href === 'string') {
    return (
      <Link {...props} className={className} ref={ref as React.ForwardedRef<HTMLAnchorElement>}>
        <Badge color={color}>{children}</Badge>
      </Link>
    )
  }

  const { disabled, type, ...buttonProps } = props as React.ButtonHTMLAttributes<HTMLButtonElement>
  return (
    <button
      {...buttonProps}
      ref={ref as React.ForwardedRef<HTMLButtonElement>}
      type={type ?? 'button'}
      disabled={disabled}
      className={className}
    >
      <Badge color={color}>{children}</Badge>
    </button>
  )
})
