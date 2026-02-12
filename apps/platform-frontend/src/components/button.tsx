import { Button as RadixButton } from '@radix-ui/themes'
import clsx from 'clsx'
import React, { forwardRef } from 'react'
import { Link } from './link'

const colorMap = {
  brand: undefined, // uses accent (amber)
  'brand/gradient': 'amber',
  'dark/zinc': 'gray',
  'dark/white': 'gray',
  dark: 'gray',
  white: 'gray',
  light: 'gray',
  zinc: 'gray',
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

type ButtonColor = keyof typeof colorMap

function getVariantAndColor(
  color?: ButtonColor,
  outline?: boolean,
  plain?: boolean
): {
  variant: 'solid' | 'outline' | 'ghost' | 'surface'
  color?: string
} {
  if (outline) return { variant: 'outline' }
  if (plain) return { variant: 'ghost' }

  if (color === 'light' || color === 'white') {
    return { variant: 'surface', color: 'gray' }
  }

  return { variant: 'solid', color: colorMap[color ?? 'dark/zinc'] }
}

type ButtonProps = (
  | { color?: ButtonColor; outline?: never; plain?: never }
  | { color?: never; outline: true; plain?: never }
  | { color?: never; outline?: never; plain: true }
) & { className?: string; children: React.ReactNode; size?: 'small' | 'medium' | 'large' } & (
    | ({ href?: never } & React.ButtonHTMLAttributes<HTMLButtonElement>)
    | ({ href: string; disabled?: boolean } & Omit<React.ComponentPropsWithoutRef<typeof Link>, 'className'>)
  )

const sizeClasses = {
  small: 'px-2 py-1 text-xs font-medium',
  medium: 'px-4 py-2 text-sm font-medium',
  large: 'px-6 py-3 text-base font-medium',
}

export const Button = forwardRef(function Button(
  { color, outline, plain, className, children, size, ...props }: ButtonProps,
  ref: React.ForwardedRef<HTMLElement>
) {
  const { variant, color: mappedColor } = getVariantAndColor(color, outline, plain)
  const isLink = typeof props.href === 'string'

  const gradientClass = color === 'brand/gradient' ? 'bg-brand-gradient' : undefined
  const combinedClassName =
    clsx(
      'ui-action-button font-medium tracking-[0.01em] transition-all duration-150 ease-out active:translate-x-px active:translate-y-px',
      className,
      gradientClass,
      size && sizeClasses[size]
    ) || undefined

  if (isLink) {
    return (
      <RadixButton
        variant={variant}
        color={mappedColor as React.ComponentProps<typeof RadixButton>['color']}
        className={combinedClassName}
        asChild
      >
        <Link {...props} ref={ref as React.ForwardedRef<HTMLAnchorElement>}>
          {children}
        </Link>
      </RadixButton>
    )
  }

  const { disabled, type, ...buttonProps } = props as React.ButtonHTMLAttributes<HTMLButtonElement>
  return (
    <RadixButton
      ref={ref as React.ForwardedRef<HTMLButtonElement>}
      {...buttonProps}
      variant={variant}
      color={mappedColor as React.ComponentProps<typeof RadixButton>['color']}
      type={type ?? 'button'}
      disabled={disabled}
      className={combinedClassName}
    >
      {children}
    </RadixButton>
  )
})

/**
 * Expand the hit area to at least 44×44px on touch devices
 */
export function TouchTarget({ children }: { children: React.ReactNode }) {
  return (
    <>
      <span
        className="absolute top-1/2 left-1/2 size-[max(100%,2.75rem)] -translate-x-1/2 -translate-y-1/2 pointer-fine:hidden"
        aria-hidden="true"
      />
      {children}
    </>
  )
}
