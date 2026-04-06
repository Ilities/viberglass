import { Link } from '@/components/link'
import { ChevronRightIcon } from '@radix-ui/react-icons'

export interface BreadcrumbItem {
  label: string
  href?: string
}

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-1 text-sm text-zinc-500 dark:text-zinc-400">
      {items.map((item, index) => {
        const isLast = index === items.length - 1
        return (
          <span key={index} className="flex items-center gap-1">
            {index > 0 && (
              <ChevronRightIcon className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" />
            )}
            {isLast || !item.href ? (
              <span className={isLast ? 'font-medium text-zinc-950 dark:text-white' : ''}>
                {item.label}
              </span>
            ) : (
              <Link href={item.href} className="hover:text-zinc-950 dark:hover:text-white">
                {item.label}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}
