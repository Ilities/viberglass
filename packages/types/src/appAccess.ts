import type { AppRunState } from './appHosting'
import type { WorkspaceRole } from './workspaceRole'

/** Someone on an app's access list. */
export interface AppAccessPerson {
  userId: string
  name: string
  email: string
  workspaceRole: WorkspaceRole
  addedAt: string
}

/** An open invite that gives the app to someone who hasn't joined yet. */
export interface AppAccessInvite {
  inviteId: string
  email: string
  expiresAt: string
}

/** The people, beyond those who see the space, who may open an app. */
export interface AppAccessList {
  people: AppAccessPerson[]
  invites: AppAccessInvite[]
}

/**
 * Adding someone by email: an existing account goes straight on the list;
 * otherwise they get an invite, whose link is shown once (`invitePath`), or the
 * app is added to the invite they already have.
 */
export type AppAccessAddition =
  | { kind: 'added'; list: AppAccessList }
  | { kind: 'invited'; list: AppAccessList; invitePath: string; emailed: boolean }
  | { kind: 'added_to_invite'; list: AppAccessList }

/** An app the caller may open, for the list app users land on. */
export interface OpenableApp {
  projectId: string
  name: string
  slug: string
  state: AppRunState
  url: string | null
}
