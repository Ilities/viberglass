import { act, renderHook, waitFor } from '@testing-library/react'
import type { ArtifactPin } from '@viberglass/types'
import { toast } from 'sonner'
import { addPin, getPins, removePin, reorderPins } from '@/service/api/pins-api'
import { usePins } from './usePins'

jest.mock('@/service/api/pins-api', () => ({ getPins: jest.fn(), addPin: jest.fn(), removePin: jest.fn(), reorderPins: jest.fn() }))
jest.mock('sonner', () => ({ toast: Object.assign(jest.fn(), { error: jest.fn() }) }))

function pin(id: string, artifactId: string, title: string): ArtifactPin {
  return {
    id,
    target: { kind: 'artifact', artifactId },
    title,
    kind: 'artifact',
    available: true,
    spaceId: 's',
    spaceSlug: 's',
    spaceName: 'S',
    current: null,
    imageUrl: null,
    hasNewVersion: false,
  }
}

/** The Undo button's handler from the toast's options. */
function undoOf(call: unknown[]): () => unknown {
  const options = call[1]
  if (typeof options === 'object' && options !== null && 'action' in options) {
    const action = options.action
    if (typeof action === 'object' && action !== null && 'onClick' in action && typeof action.onClick === 'function') {
      const onClick = action.onClick
      return () => onClick()
    }
  }
  throw new Error('The toast has no Undo')
}

describe('usePins', () => {
  it('unpins at once, and Undo pins it again in its old place', async () => {
    const guide = pin('p-1', 'a-1', 'Guide')
    const deck = pin('p-2', 'a-2', 'Deck')
    jest.mocked(getPins).mockResolvedValue([guide, deck])
    jest.mocked(removePin).mockResolvedValue([deck])
    jest.mocked(addPin).mockResolvedValue([deck, { ...guide, id: 'p-3' }])
    jest.mocked(reorderPins).mockResolvedValue([{ ...guide, id: 'p-3' }, deck])
    const { result } = renderHook(() => usePins())
    await waitFor(() => expect(result.current.pins).toHaveLength(2))

    await act(() => result.current.unpin(guide.target))
    expect(result.current.isPinned(guide.target)).toBe(false)
    expect(toast).toHaveBeenCalledWith('Unpinned Guide', expect.objectContaining({ action: expect.objectContaining({ label: 'Undo' }) }))

    await act(async () => {
      await undoOf(jest.mocked(toast).mock.calls[0])()
    })
    expect(reorderPins).toHaveBeenCalledWith(['p-3', 'p-2'])
    expect(result.current.pins?.map((candidate) => candidate.title)).toEqual(['Guide', 'Deck'])
  })

  it('puts the pin back when unpinning fails', async () => {
    const guide = pin('p-1', 'a-1', 'Guide')
    jest.mocked(getPins).mockResolvedValue([guide])
    jest.mocked(removePin).mockRejectedValue(new Error('Offline'))
    const { result } = renderHook(() => usePins())
    await waitFor(() => expect(result.current.pins).toHaveLength(1))

    await act(() => result.current.unpin(guide.target))

    expect(result.current.isPinned(guide.target)).toBe(true)
    expect(toast.error).toHaveBeenCalledWith('Offline')
  })
})
