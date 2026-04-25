import { Heading as RadixHeading } from '@radix-ui/themes'
import React from 'react'

type HeadingProps = { level?: 1 | 2 | 3 | 4 | 5 | 6 } & Omit<React.ComponentPropsWithoutRef<
  'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
>, 'color'>

export function Heading({ className, level = 1, ...props }: HeadingProps) {
  return (
    <RadixHeading
      {...props}
      as={`h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'}
      size="6"
      weight="bold"
      className={className}
    />
  )
}

export function Subheading({ className, level = 2, ...props }: HeadingProps) {
  return (
    <RadixHeading
      {...props}
      as={`h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'}
      size="3"
      weight="medium"
      className={className}
    />
  )
}
