import type { Clanker, CreateClankerRequest } from '@viberglass/types'

export interface RunnerFormProps {
  /** The runner being edited; absent when creating one. */
  initial?: Clanker
  submitLabel: string
  submittingLabel: string
  onSubmit: (request: CreateClankerRequest) => Promise<void>
  onCancel: () => void
  /** Opens Advanced for a link to instructions or tools. */
  openAdvanced?: boolean
}

