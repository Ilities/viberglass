import { Input } from '@/components/input'
import { MagnifyingGlassIcon } from '@radix-ui/react-icons'
import { forwardRef } from 'react'

interface SearchInputProps extends Omit<React.ComponentPropsWithoutRef<'input'>, 'className' | 'type'> {
  placeholder?: string
  name?: string
  defaultValue?: string
  value?: string
  disabled?: boolean
  className?: string
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  function SearchInput({ placeholder = 'Search...', className: _className, ...props }, ref) {
    const modKey = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl+'
    return (
      <div className="relative h-9">
        <Input
          ref={ref}
          type="search"
          placeholder={placeholder}
          className="pr-16"
          {...props}
        />
        <MagnifyingGlassIcon className="absolute top-1/2 right-3 h-5 w-5 -translate-y-1/2 text-zinc-400" />
        <kbd className="absolute top-1/2 right-9 -translate-y-1/2 rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500">
          {modKey}K
        </kbd>
      </div>
    )
  }
)
