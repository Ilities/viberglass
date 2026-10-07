export type DiffKind = 'same' | 'added' | 'removed'
export type DiffLine = { kind: DiffKind; text: string }

/** Where two sequences differ, by longest common subsequence. */
function diffSequences(a: string[], b: string[]): DiffLine[] {
  // common[i][j]: how many items a[i..] and b[j..] have in common.
  const common = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      common[i][j] = a[i] === b[j] ? common[i + 1][j + 1] + 1 : Math.max(common[i + 1][j], common[i][j + 1])
    }
  }
  const items: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      items.push({ kind: 'same', text: a[i] })
      i++
      j++
    } else if (common[i + 1][j] >= common[i][j + 1]) {
      items.push({ kind: 'removed', text: a[i++] })
    } else {
      items.push({ kind: 'added', text: b[j++] })
    }
  }
  while (i < a.length) items.push({ kind: 'removed', text: a[i++] })
  while (j < b.length) items.push({ kind: 'added', text: b[j++] })
  return items
}

/** The lines that differ between two versions of a document. */
export function diffLines(before: string, after: string): DiffLine[] {
  return diffSequences(before.split('\n'), after.split('\n'))
}

// Past this many token pairs a word diff is too slow to be worth it, and the lines are shown as replaced.
const MAX_WORD_PAIRS = 1_000_000

/** The words, and the spaces between them, that differ between two stretches of text. */
export function diffWords(before: string, after: string): DiffLine[] {
  const a = before.split(/(\s+)/).filter(Boolean)
  const b = after.split(/(\s+)/).filter(Boolean)
  if (a.length * b.length > MAX_WORD_PAIRS) {
    return [
      { kind: 'removed', text: before },
      { kind: 'added', text: after },
    ]
  }
  return diffSequences(a, b)
}
