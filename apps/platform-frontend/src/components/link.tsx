import { Link as RouterLink, type LinkProps as RouterLinkProps } from 'react-router-dom'
import React, { forwardRef } from 'react'
import { composeEventHandlers, useDataInteraction } from './interaction'

export const Link = forwardRef(function Link(
  {
    href,
    disabled,
    focusOnHover,
    onClick,
    onPointerEnter,
    onPointerLeave,
    onPointerDown,
    onPointerUp,
    onKeyDown,
    onKeyUp,
    onFocus,
    onBlur,
    tabIndex,
    ...props
  }: { href: string } & Omit<RouterLinkProps, 'to'> & React.ComponentPropsWithoutRef<'a'> & { disabled?: boolean; focusOnHover?: boolean },
  ref: React.ForwardedRef<HTMLAnchorElement>
) {
  const { dataAttributes, eventHandlers } = useDataInteraction({ disabled, focusOnHover })

  return (
    <RouterLink
      {...props}
      to={href}
      ref={ref}
      {...dataAttributes}
      aria-disabled={disabled ? true : undefined}
      tabIndex={disabled ? -1 : tabIndex}
      onClick={composeEventHandlers(onClick, (event) => {
        if (disabled) {
          event.preventDefault()
          event.stopPropagation()
        }
      })}
      onPointerEnter={composeEventHandlers(onPointerEnter, eventHandlers.onPointerEnter)}
      onPointerLeave={composeEventHandlers(onPointerLeave, eventHandlers.onPointerLeave)}
      onPointerDown={composeEventHandlers(onPointerDown, eventHandlers.onPointerDown)}
      onPointerUp={composeEventHandlers(onPointerUp, eventHandlers.onPointerUp)}
      onKeyDown={composeEventHandlers(onKeyDown, eventHandlers.onKeyDown)}
      onKeyUp={composeEventHandlers(onKeyUp, eventHandlers.onKeyUp)}
      onFocus={composeEventHandlers(onFocus, eventHandlers.onFocus)}
      onBlur={composeEventHandlers(onBlur, eventHandlers.onBlur)}
    />
  )
})
