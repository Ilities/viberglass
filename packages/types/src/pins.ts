import type { ArtifactCover, ArtifactFormat } from './artifacts'
import type { OutputReleaseStatus } from './outputs'

/** What a pin points at: an artifact, which always opens at its latest version, or an App space's app. */
export type PinTarget = { kind: 'artifact'; artifactId: string } | { kind: 'app'; spaceId: string }

/** One key per pinnable thing, for matching pins to what a page shows. */
export function pinKey(target: PinTarget): string {
  return target.kind === 'artifact' ? `artifact:${target.artifactId}` : `app:${target.spaceId}`
}

interface PinBase {
  id: string
  target: PinTarget
  /** As it was named when pinned, so a pin that can't be opened any more still says what it was. */
  title: string
}

export interface ArtifactPin extends PinBase {
  kind: 'artifact'
  available: true
  spaceId: string
  spaceSlug: string
  spaceName: string
  current: { versionId: string; number: number; format: ArtifactFormat; cover: ArtifactCover | null; createdAt: string } | null
  /** A short-lived link to an image, which is its own cover. */
  imageUrl: string | null
  /** A version arrived since the person last opened it. */
  hasNewVersion: boolean
}

export interface AppPin extends PinBase {
  kind: 'app'
  available: true
  spaceSlug: string
  spaceName: string
  /** The release it serves, or else its newest; null before the first. */
  release: { status: OutputReleaseStatus; commitSha: string; createdAt: string } | null
  /** Serving now, so it can be opened. */
  running: boolean
  appUrl: string | null
}

/** A pin to something the person can no longer see. */
export interface UnavailablePin extends PinBase {
  kind: PinTarget['kind']
  available: false
}

export type Pin = ArtifactPin | AppPin | UnavailablePin
