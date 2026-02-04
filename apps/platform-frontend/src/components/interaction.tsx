import { useCallback, useEffect, useRef, useState } from 'react'

type InteractionState = {
  hover: boolean
  focus: boolean
  active: boolean
}

export function useDataInteraction({
  disabled,
  focusOnHover,
}: {
  disabled?: boolean
  focusOnHover?: boolean
} = {}) {
  const ref = useRef<HTMLElement | null>(null)
  const [state, setState] = useState<InteractionState>({
    hover: false,
    focus: false,
    active: false,
  })

  const isDisabled = disabled ?? false

  const onPointerEnter = useCallback(() => {
    if (!isDisabled) {
      setState((prev) => ({ ...prev, hover: true }))
      if (focusOnHover) {
        ref.current?.focus()
      }
    }
  }, [isDisabled, focusOnHover])

  const onPointerLeave = useCallback(() => {
    if (!isDisabled) {
      setState((prev) => ({ ...prev, hover: false }))
    }
  }, [isDisabled])

  const onPointerDown = useCallback(() => {
    if (!isDisabled) {
      setState((prev) => ({ ...prev, active: true }))
    }
  }, [isDisabled])

  const onPointerUp = useCallback(() => {
    if (!isDisabled) {
      setState((prev) => ({ ...prev, active: false }))
    }
  }, [isDisabled])

  const onFocus = useCallback(() => {
    if (!isDisabled) {
      setState((prev) => ({ ...prev, focus: true }))
    }
  }, [isDisabled])

  const onBlur = useCallback(() => {
    if (!isDisabled) {
      setState((prev) => ({ ...prev, focus: false }))
    }
  }, [isDisabled])

  useEffect(() => {
    return () => {
      setState({ hover: false, focus: false, active: false })
    }
  }, [isDisabled])

  return {
    dataAttributes: {
      'data-hover': state.hover ? '' : undefined,
      'data-focus': state.focus ? '' : undefined,
      'data-active': state.active ? '' : undefined,
      'data-disabled': isDisabled ? '' : undefined,
    },
    eventHandlers: {
      onPointerEnter,
      onPointerLeave,
      onPointerDown,
      onPointerUp,
      onFocus,
      onBlur,
      onKeyDown: undefined as unknown as React.KeyboardEventHandler<HTMLElement>,
      onKeyUp: undefined as unknown as React.KeyboardEventHandler<HTMLElement>,
    },
  }
}

export function composeEventHandlers<T extends { defaultPrevented?: boolean }>(
  theirHandler: ((event: T) => void) | undefined,
  ourHandler: (event: T) => void
): (event: T) => void {
  return (event) => {
    theirHandler?.(event)
    if (!event.defaultPrevented) {
      ourHandler(event)
    }
  }
}
