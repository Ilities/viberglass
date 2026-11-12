import { addPin, getPins, removePin, reorderPins } from '@/service/api/pins-api'
import { pinKey, type Pin, type PinTarget } from '@viberglass/types'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

const errorText = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback)

/** The person's pins, with pinning, unpinning (undoable) and reordering. */
export function usePins() {
  const [pins, setPins] = useState<Pin[] | null>(null)

  useEffect(() => {
    let cancelled = false
    getPins()
      .then((loaded) => !cancelled && setPins(loaded))
      .catch(() => !cancelled && setPins([]))
    return () => {
      cancelled = true
    }
  }, [])

  const keys = useMemo(() => new Set((pins ?? []).map((pin) => pinKey(pin.target))), [pins])

  const pin = useCallback(async (target: PinTarget) => {
    try {
      setPins(await addPin(target))
    } catch (error) {
      toast.error(errorText(error, "Couldn't pin it"))
    }
  }, [])

  const unpin = useCallback(
    async (target: PinTarget) => {
      const before = pins ?? []
      const removed = before.find((candidate) => pinKey(candidate.target) === pinKey(target))
      if (!removed) return
      setPins(before.filter((candidate) => candidate !== removed))
      try {
        setPins(await removePin(removed.id))
      } catch (error) {
        setPins(before)
        toast.error(errorText(error, "Couldn't unpin it"))
        return
      }
      toast(`Unpinned ${removed.title}`, {
        action: {
          label: 'Undo',
          onClick: async () => {
            try {
              const restored = await addPin(target)
              const idFor = (key: string) => restored.find((candidate) => pinKey(candidate.target) === key)?.id
              const order = before.flatMap((candidate) => idFor(pinKey(candidate.target)) ?? [])
              setPins(await reorderPins(order))
            } catch (error) {
              toast.error(errorText(error, "Couldn't pin it again"))
            }
          },
        },
      })
    },
    [pins]
  )

  const reorder = useCallback(
    async (ordered: Pin[]) => {
      const before = pins
      setPins(ordered)
      try {
        setPins(await reorderPins(ordered.map((candidate) => candidate.id)))
      } catch (error) {
        setPins(before)
        toast.error(errorText(error, "Couldn't save the order"))
      }
    },
    [pins]
  )

  const isPinned = useCallback((target: PinTarget) => keys.has(pinKey(target)), [keys])
  const toggle = useCallback((target: PinTarget) => (isPinned(target) ? unpin(target) : pin(target)), [isPinned, pin, unpin])

  return { pins, isPinned, toggle, unpin, reorder }
}
