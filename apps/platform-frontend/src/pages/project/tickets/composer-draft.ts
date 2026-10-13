import { agentMentionToken, mentionToken } from '@viberglass/types'
import { useState } from 'react'

/** Someone or something a message can mention. */
export interface Mentionable {
  kind: 'user' | 'agent'
  id: string
  name: string
}

/** What's written in the composer; the suggested actions send it too, so it lives above both. */
export interface ComposerDraft {
  text: string
  setText: (text: string) => void
  pick: (entry: Mentionable) => void
  /** The text with each picked "@Name" as a mention the server can read. */
  body: () => string
  isEmpty: boolean
  clear: () => void
}

export function useComposerDraft(): ComposerDraft {
  const [text, setText] = useState('')
  const [picked, setPicked] = useState<Mentionable[]>([])
  return {
    text,
    setText,
    pick(entry) {
      setText(text.replace(/@[\p{L}\p{N}._-]{0,30}$/u, `@${entry.name} `))
      setPicked((current) => (current.some((other) => other.id === entry.id) ? current : [...current, entry]))
    },
    body: () =>
      picked.reduce((body, entry) => {
        const token = entry.kind === 'agent' ? agentMentionToken(entry.name, entry.id) : mentionToken(entry.name, entry.id)
        return body.split(`@${entry.name}`).join(token)
      }, text),
    isEmpty: text.trim().length === 0,
    clear() {
      setText('')
      setPicked([])
    },
  }
}
