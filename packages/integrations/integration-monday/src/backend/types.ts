import type { AuthCredentials } from '@viberglass/types'

export interface MondayConfig extends AuthCredentials {
  boardId: string
  groupId?: string
}
