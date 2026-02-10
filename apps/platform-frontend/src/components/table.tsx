import { Table as RadixTable } from '@radix-ui/themes'
import clsx from 'clsx'
import type React from 'react'
import { createContext, useContext, useState } from 'react'
import { Link } from './link'

const TableContext = createContext<{ bleed: boolean; dense: boolean; grid: boolean; striped: boolean }>({
  bleed: false,
  dense: false,
  grid: false,
  striped: false,
})

export function Table({
  bleed = false,
  dense = false,
  grid = false,
  striped = false,
  className,
  children,
  ...props
}: { bleed?: boolean; dense?: boolean; grid?: boolean; striped?: boolean } & React.ComponentPropsWithoutRef<'div'>) {
  return (
    <TableContext.Provider value={{ bleed, dense, grid, striped }}>
      <div className="flow-root">
        <div {...props} className={clsx(className, '-mx-(--gutter) overflow-x-auto whitespace-nowrap')}>
          <div className={clsx('inline-block min-w-full align-middle', !bleed && 'sm:px-(--gutter)')}>
            <RadixTable.Root size={dense ? '1' : '2'} variant={striped ? 'surface' : 'ghost'} className="ui-data-table">
              {children}
            </RadixTable.Root>
          </div>
        </div>
      </div>
    </TableContext.Provider>
  )
}

export function TableHead({ className, ...props }: React.ComponentPropsWithoutRef<'thead'>) {
  return <RadixTable.Header className={className} {...props} />
}

export function TableBody(props: React.ComponentPropsWithoutRef<'tbody'>) {
  return <RadixTable.Body {...props} />
}

const TableRowContext = createContext<{ href?: string; target?: string; title?: string }>({
  href: undefined,
  target: undefined,
  title: undefined,
})

export function TableRow({
  href,
  target,
  title,
  className,
  ...props
}: { href?: string; target?: string; title?: string } & React.ComponentPropsWithoutRef<'tr'>) {
  return (
    <TableRowContext.Provider value={{ href, target, title }}>
      <RadixTable.Row
        {...props}
        className={clsx(className, href && 'cursor-pointer hover:bg-zinc-950/5 dark:hover:bg-white/5')}
      />
    </TableRowContext.Provider>
  )
}

export function TableHeader({ className, ...props }: React.ComponentPropsWithoutRef<'th'>) {
  return <RadixTable.ColumnHeaderCell {...props} className={className} />
}

export function TableCell({
  className,
  children,
  excludeRowLink = false,
  ...props
}: React.ComponentPropsWithoutRef<typeof RadixTable.Cell> & { excludeRowLink?: boolean }) {
  const { href, target, title } = useContext(TableRowContext)
  const shouldLink = href && !excludeRowLink
  const [cellRef, setCellRef] = useState<HTMLElement | null>(null)

  return (
    <RadixTable.Cell
      ref={shouldLink ? setCellRef : undefined}
      {...props}
      className={clsx(className, shouldLink && 'relative')}
    >
      {shouldLink && href && (
        <Link
          data-row-link
          href={href}
          target={target}
          aria-label={title}
          tabIndex={cellRef?.previousElementSibling === null ? 0 : -1}
          className="absolute inset-0 z-0 focus:outline-hidden"
        />
      )}
      {children}
    </RadixTable.Cell>
  )
}
