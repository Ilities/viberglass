import { Avatar as RadixAvatar } from '@radix-ui/themes'
import React, { forwardRef } from 'react'
import { Link } from './link'

type AvatarProps = {
  src?: string | null
  square?: boolean
  initials?: string
  alt?: string
  className?: string
}

export function Avatar({
  src = null,
  square = false,
  initials,
  alt = '',
  className,
  ...props
}: AvatarProps & React.ComponentPropsWithoutRef<'span'>) {
  return (
    <RadixAvatar
      data-slot="avatar"
      src={src ?? undefined}
      fallback={initials ?? ''}
      alt={alt}
      radius={square ? 'medium' : 'full'}
      className={className}
      {...props}
    />
  )
}

export const AvatarButton = forwardRef(function AvatarButton(
  {
    src,
    square = false,
    initials,
    alt,
    className,
    ...props
  }: AvatarProps &
    (
      | ({ href?: never } & React.ButtonHTMLAttributes<HTMLButtonElement>)
      | ({ href: string; disabled?: boolean } & Omit<React.ComponentPropsWithoutRef<typeof Link>, 'className'>)
    ),
  ref: React.ForwardedRef<HTMLButtonElement>
) {
  if (typeof props.href === 'string') {
    return (
      <Link {...props} className={className} ref={ref as React.ForwardedRef<HTMLAnchorElement>}>
        <Avatar src={src} square={square} initials={initials} alt={alt} />
      </Link>
    )
  }

  const { disabled, type, ...buttonProps } = props as React.ButtonHTMLAttributes<HTMLButtonElement>
  return (
    <button
      {...buttonProps}
      ref={ref}
      type={type ?? 'button'}
      disabled={disabled}
      className={className}
    >
      <Avatar src={src} square={square} initials={initials} alt={alt} />
    </button>
  )
})
