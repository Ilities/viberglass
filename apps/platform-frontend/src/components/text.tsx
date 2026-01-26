import {
  Code as RadixCode,
  Link as RadixLink,
  Strong as RadixStrong,
  Text as RadixText,
} from '@radix-ui/themes'
import { Link } from './link'

export function Text({ className, ...props }: React.ComponentPropsWithoutRef<'p'>) {
  return <RadixText data-slot="text" as="p" size="2" color="gray" className={className} {...props} />
}

export function TextLink({ className, ...props }: React.ComponentPropsWithoutRef<typeof Link>) {
  return (
    <RadixLink asChild>
      <Link {...props} className={className} />
    </RadixLink>
  )
}

export function Strong({ className, ...props }: React.ComponentPropsWithoutRef<'strong'>) {
  return <RadixStrong className={className} {...props} />
}

export function Code({ className, ...props }: React.ComponentPropsWithoutRef<'code'>) {
  return <RadixCode className={className} {...props} />
}
