import type { ArtifactFormat } from '@viberglass/types'

const FORMAT_LABEL: Record<ArtifactFormat, string> = {
  markdown: 'Markdown',
  text: 'Text',
  json: 'JSON',
  csv: 'CSV',
  image: 'Image',
  pdf: 'PDF',
  svg: 'SVG',
  html: 'HTML',
  other: 'File',
}

export function formatLabel(format: ArtifactFormat): string {
  return FORMAT_LABEL[format]
}

/** "512 B", "14 KB", "2.3 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** An artifact's page, at a version when one is named. */
export function artifactPath(space: string, artifactId: string, versionId?: string): string {
  return `/spaces/${space}/artifacts/${artifactId}${versionId ? `?version=${versionId}` : ''}`
}
