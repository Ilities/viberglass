import { AppCover, type CoverStatusTone } from '@/components/covers/app-cover'
import { ArtifactCover } from '@/components/covers/artifact-cover'
import type { AppPreviewState, OutputItem, OutputReleaseStatus } from '@viberglass/types'
import { RELEASE_STATUS_LABEL } from './output-text'

const RELEASE_TONE: Record<OutputReleaseStatus, CoverStatusTone> = {
  live: 'live',
  building: 'working',
  failed: 'failed',
  rolled_back: 'idle',
  was_live: 'idle',
  ready: 'idle',
}

const PREVIEW_STATUS: Record<AppPreviewState, { label: string; tone: CoverStatusTone }> = {
  running: { label: 'Preview running', tone: 'preview' },
  building: { label: 'Building', tone: 'working' },
  starting: { label: 'Starting', tone: 'working' },
  stopping: { label: 'Stopping', tone: 'working' },
  failed: { label: "Preview couldn't start", tone: 'failed' },
  off: { label: 'Off', tone: 'idle' },
}

export function releaseStatus(status: OutputReleaseStatus): { label: string; tone: CoverStatusTone } {
  return { label: RELEASE_STATUS_LABEL[status], tone: RELEASE_TONE[status] }
}

export function previewStatus(state: AppPreviewState): { label: string; tone: CoverStatusTone } {
  return PREVIEW_STATUS[state]
}

export function OutputCover({ item, size = 'card' }: { item: OutputItem; size?: 'card' | 'thumb' }) {
  if (item.type === 'artifact') {
    return <ArtifactCover title={item.title} format={item.format} cover={item.cover} imageUrl={item.imageUrl} expired={item.expired} size={size} />
  }
  if (item.type === 'release') {
    return <AppCover name={item.spaceName} seed={item.spaceId} status={releaseStatus(item.status)} detail={item.commitSha.slice(0, 7)} size={size} />
  }
  return <AppCover name={item.spaceName} seed={item.spaceId} status={previewStatus(item.state)} detail={item.taskKey ?? undefined} size={size} />
}
