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

// Each hook depends on the stable setter alone: the context object changes with the flag it sets.
export function useRegisterFieldDescription() {
  const setHasDescription = useFieldContext()?.setHasDescription

  useEffect(() => {
    if (!setHasDescription) return
    setHasDescription(true)
    return () => setHasDescription(false)
  }, [setHasDescription])
}

export function useRegisterFieldError() {
  const setHasError = useFieldContext()?.setHasError

  useEffect(() => {
    if (!setHasError) return
    setHasError(true)
    return () => setHasError(false)
  }, [setHasError])
}
