'use client'

import React, { createContext, useContext, useEffect, useId, useMemo, useState } from 'react'

type FieldContextValue = {
  controlId: string
  labelId: string
  descriptionId: string
  errorId: string
  disabled?: boolean
  hasDescription: boolean
  hasError: boolean
  setHasDescription: (value: boolean) => void
  setHasError: (value: boolean) => void
}

const FieldContext = createContext<FieldContextValue | null>(null)

export function useFieldContext() {
  return useContext(FieldContext)
}

export function FieldProvider({ disabled, children }: { disabled?: boolean; children: React.ReactNode }) {
  const baseId = useId()
  const [hasDescription, setHasDescription] = useState(false)
  const [hasError, setHasError] = useState(false)

  const value = useMemo(
    () => ({
      controlId: `field-${baseId}-control`,
      labelId: `field-${baseId}-label`,
      descriptionId: `field-${baseId}-description`,
      errorId: `field-${baseId}-error`,
      disabled,
      hasDescription,
      hasError,
      setHasDescription,
      setHasError,
    }),
    [baseId, disabled, hasDescription, hasError]
  )

  return <FieldContext.Provider value={value}>{children}</FieldContext.Provider>
}

export function useRegisterFieldDescription() {
  const context = useFieldContext()

  useEffect(() => {
    if (!context) return
    context.setHasDescription(true)
    return () => context.setHasDescription(false)
  }, [context])
}

export function useRegisterFieldError() {
  const context = useFieldContext()

  useEffect(() => {
    if (!context) return
    context.setHasError(true)
    return () => context.setHasError(false)
  }, [context])
}
