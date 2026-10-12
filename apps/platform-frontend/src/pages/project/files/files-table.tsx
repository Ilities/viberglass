import { Button } from '@/components/button'
import { formatBytes } from '@/lib/artifacts'
import { FileIcon, FileTextIcon } from '@radix-ui/react-icons'
import {
  SPACE_TEXT_FILE_EXTENSIONS,
  SPACE_TEXT_FILE_MAX_BYTES,
  type SpaceFilesManifestEntry,
} from '@viberglass/types'

/** Whether the editor opens the file: Markdown or plain text, small enough to edit in the browser. */
export function isEditableText(file: Pick<SpaceFilesManifestEntry, 'path' | 'bytes'>): boolean {
  const extension = file.path.split('.').pop()?.toLowerCase() ?? ''
  return (SPACE_TEXT_FILE_EXTENSIONS as readonly string[]).includes(extension) && file.bytes <= SPACE_TEXT_FILE_MAX_BYTES
}

export type FileRow =
  | { kind: 'folder'; path: string; name: string; depth: number }
  | { kind: 'file'; file: SpaceFilesManifestEntry; name: string; depth: number }

/** The files in folder order, each folder as a row of its own above what's in it. */
export function fileRows(files: SpaceFilesManifestEntry[]): FileRow[] {
  interface Folder {
    folders: Map<string, Folder>
    files: SpaceFilesManifestEntry[]
  }
  const root: Folder = { folders: new Map(), files: [] }
  for (const file of files) {
    const parts = file.path.split('/')
    let folder = root
    for (const name of parts.slice(0, -1)) {
      if (!folder.folders.has(name)) folder.folders.set(name, { folders: new Map(), files: [] })
      folder = folder.folders.get(name)!
    }
    folder.files.push(file)
  }
  const rows: FileRow[] = []
  // Within a folder, its subfolders come first, then its files, each by name.
  const walk = (folder: Folder, prefix: string, depth: number) => {
    for (const name of [...folder.folders.keys()].sort((a, b) => a.localeCompare(b))) {
      const path = prefix ? `${prefix}/${name}` : name
      rows.push({ kind: 'folder', path, name, depth })
      walk(folder.folders.get(name)!, path, depth + 1)
    }
    for (const file of [...folder.files].sort((a, b) => a.path.localeCompare(b.path))) {
      rows.push({ kind: 'file', file, name: file.path.split('/').pop() ?? file.path, depth })
    }
  }
  walk(root, '', 0)
  return rows
}

export function FilesTable({
  files,
  canChange,
  onEdit,
  onDownload,
  onDelete,
}: {
  files: SpaceFilesManifestEntry[]
  canChange: boolean
  onEdit: (path: string) => void
  onDownload: (path: string) => void
  onDelete: (path: string) => void
}) {
  return (
    <ul
      aria-label="Files"
      className="divide-y divide-[var(--gray-5)] overflow-hidden rounded-[9px] border border-[var(--gray-5)] bg-[var(--color-panel-solid)]"
    >
      {fileRows(files).map((row) =>
        row.kind === 'folder' ? (
          <li key={`folder:${row.path}`} className="px-5 py-2.5 text-sm font-medium text-[var(--gray-11)] max-sm:px-3">
            <span style={{ paddingLeft: `${row.depth * 1.25}rem` }}>{row.name}/</span>
          </li>
        ) : (
          <li
            key={row.file.path}
            aria-label={row.file.path}
            className="flex items-center justify-between gap-4 px-5 py-2.5 text-sm max-sm:gap-2 max-sm:px-3"
          >
            <span className="flex min-w-0 items-center gap-2" style={{ paddingLeft: `${row.depth * 1.25}rem` }}>
              {isEditableText(row.file) ? (
                <FileTextIcon aria-hidden className="size-4 shrink-0 text-[var(--gray-10)]" />
              ) : (
                <FileIcon aria-hidden className="size-4 shrink-0 text-[var(--gray-10)]" />
              )}
              <span className="truncate text-[var(--gray-12)]" title={row.file.path}>
                {row.name}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="w-16 text-right text-xs text-[var(--gray-10)] tabular-nums">{formatBytes(row.file.bytes)}</span>
              {canChange && isEditableText(row.file) && (
                <Button plain size="small" onClick={() => onEdit(row.file.path)} aria-label={`Edit ${row.file.path}`}>
                  Edit
                </Button>
              )}
              <Button plain size="small" onClick={() => onDownload(row.file.path)} aria-label={`Download ${row.file.path}`}>
                Download
              </Button>
              {canChange && (
                <Button plain size="small" onClick={() => onDelete(row.file.path)} aria-label={`Delete ${row.file.path}`}>
                  Delete
                </Button>
              )}
            </span>
          </li>
        )
      )}
    </ul>
  )
}
