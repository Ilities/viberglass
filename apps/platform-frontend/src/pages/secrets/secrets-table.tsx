import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { Timestamp } from '@/components/timestamp'
import type { Secret, SecretLocation } from '@/service/api/secret-api'
import { Pencil1Icon, TrashIcon } from '@radix-ui/react-icons'
import { getModelProvider } from '@viberglass/types'
import { describeSecretUsers, type SecretUsers } from './secretUsers'

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

function reference(secret: Secret): string | null {
  if (secret.secretLocation === 'ssm') return secret.secretPath || null
  if (secret.secretLocation === 'env') return secret.sourceEnvVar || null
  return null
}

interface SecretsTableProps {
  secrets: Secret[]
  usedBy: Map<string, SecretUsers>
  /** Off when every secret is stored in the database, the default, so the column would say nothing. */
  showStorage: boolean
  onEdit: (secret: Secret) => void
  onDelete: (secret: Secret) => void
}

export function SecretsTable({ secrets, usedBy, showStorage, onEdit, onDelete }: SecretsTableProps) {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeader>Name</TableHeader>
          <TableHeader>Used by</TableHeader>
          {showStorage && <TableHeader>Storage</TableHeader>}
          <TableHeader>Updated</TableHeader>
          <TableHeader />
        </TableRow>
      </TableHead>
      <TableBody>
        {secrets.map((secret) => {
          const users = describeSecretUsers(usedBy.get(secret.id))
          const ref = reference(secret)
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
              <TableCell className="whitespace-normal text-zinc-500 dark:text-zinc-400">
                {users.length > 0 ? users.map((line) => <div key={line}>{line}</div>) : 'Not used'}
              </TableCell>
              {showStorage && (
                <TableCell>
                  <Badge color={badgeColors[secret.secretLocation]}>{locationLabels[secret.secretLocation]}</Badge>
                  {ref && <div className="mt-1 font-mono text-xs text-zinc-500 dark:text-zinc-400">{ref}</div>}
                </TableCell>
              )}
              <TableCell className="text-zinc-500 dark:text-zinc-400">
                <Timestamp date={secret.updatedAt} />
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-2">
                  <Button plain onClick={() => onEdit(secret)} aria-label={`Edit ${secret.name}`}>
                    <Pencil1Icon className="h-4 w-4" />
                  </Button>
                  <Button surface color="red" onClick={() => onDelete(secret)} aria-label={`Delete ${secret.name}`}>
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
