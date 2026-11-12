import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { Timestamp } from '@/components/timestamp'
import type { OutputItem } from '@viberglass/types'
import { OutputCover } from './output-cover'
import { KIND_SINGULAR, outputHref, outputLabel, outputReason, outputTitle } from './output-text'

/** The same outputs as rows, for people with many of them. */
export function OutputsList({ items }: { items: OutputItem[] }) {
  return (
    <Table className="mt-6">
      <TableHead>
        <TableRow>
          <TableHeader className="w-20">
            <span className="sr-only">Cover</span>
          </TableHeader>
          <TableHeader>Name</TableHeader>
          <TableHeader>Space</TableHeader>
          <TableHeader>Kind</TableHeader>
          <TableHeader>Version</TableHeader>
          <TableHeader>Why</TableHeader>
          <TableHeader>When</TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id} href={outputHref(item)} title={outputTitle(item)} className="[&>td]:align-middle">
            <TableCell>
              <div className="w-16">
                <OutputCover item={item} size="thumb" />
              </div>
            </TableCell>
            <TableCell className="max-w-72 truncate font-medium text-[var(--gray-12)]">{outputTitle(item)}</TableCell>
            <TableCell className="text-[var(--gray-11)]">{item.spaceName}</TableCell>
            <TableCell className="text-[var(--gray-11)]">{item.kind ? KIND_SINGULAR[item.kind] : 'Other'}</TableCell>
            <TableCell className="font-mono text-xs text-[var(--gray-11)]">{outputLabel(item)}</TableCell>
            <TableCell className="max-w-72 truncate text-[var(--gray-10)]">{outputReason(item)}</TableCell>
            <TableCell className="text-[var(--gray-10)]">
              <Timestamp date={item.createdAt} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
