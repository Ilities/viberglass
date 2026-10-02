import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { Timestamp } from '@/components/timestamp'
import type { Secret, SecretLocation } from '@/service/api/secret-api'
import { Pencil1Icon, TrashIcon } from '@radix-ui/react-icons'
import { getModelProvider } from '@viberglass/types'

const badgeColors: Record<SecretLocation, 'green' | 'blue' | 'amber'> = {
  env: 'green',
  database: 'blue',
  ssm: 'amber',
}

const locationLabels: Record<SecretLocation, string> = {
  env: 'Env',
  database: 'Database',
  ssm: 'SSM',
}

function reference(secret: Secret): string {
  if (secret.secretLocation === 'ssm') return secret.secretPath || '—'
  if (secret.secretLocation === 'env') return secret.sourceEnvVar || '—'
  return '—'
}

interface SecretsTableProps {
  secrets: Secret[]
  /** Names of the runners that use each secret, by secret id. */
  usedBy: Map<string, string[]>
  onEdit: (secret: Secret) => void
  onDelete: (secret: Secret) => void
}

export function SecretsTable({ secrets, usedBy, onEdit, onDelete }: SecretsTableProps) {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeader>Name</TableHeader>
          <TableHeader>Used by</TableHeader>
          <TableHeader>Storage</TableHeader>
          <TableHeader>Reference</TableHeader>
          <TableHeader>Updated</TableHeader>
          <TableHeader />
        </TableRow>
      </TableHead>
      <TableBody>
        {secrets.map((secret) => {
          const runners = usedBy.get(secret.id) ?? []
          return (
            <TableRow key={secret.id}>
              <TableCell className="font-medium text-zinc-950 dark:text-white">
                {secret.name}
                {secret.provider && (
                  <div className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
                    {getModelProvider(secret.provider).displayName}
                  </div>
                )}
              </TableCell>
              <TableCell className="text-zinc-500 dark:text-zinc-400">
                {runners.length > 0 ? runners.join(', ') : 'No runner'}
              </TableCell>
              <TableCell>
                <Badge color={badgeColors[secret.secretLocation]}>{locationLabels[secret.secretLocation]}</Badge>
              </TableCell>
              <TableCell className="text-zinc-500 dark:text-zinc-400">{reference(secret)}</TableCell>
              <TableCell className="text-zinc-500 dark:text-zinc-400">
                <Timestamp date={secret.updatedAt} />
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-2">
                  <Button
                    plain
                    onClick={() => onEdit(secret)}
                    aria-label="Edit secret"
                    className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                  >
                    <Pencil1Icon className="h-4 w-4" />
                  </Button>
                  <Button surface color="red" onClick={() => onDelete(secret)} aria-label="Delete secret">
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
