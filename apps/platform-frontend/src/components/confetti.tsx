import { useEffect, useState } from 'react'

interface ConfettiPiece {
  id: number
  x: number
  color: string
  delay: number
  duration: number
  size: number
}

const COLORS = [
  '#F59E0B', // amber-500
  '#D97706', // amber-600
  '#B45309', // amber-700
  '#FBBF24', // amber-400
  '#FCD34D', // amber-300
  '#EF4444', // red-500
  '#8B5CF6', // violet-500
  '#EC4899', // pink-500
  '#10B981', // emerald-500
]

export function Confetti({ active, duration = 3000 }: { active: boolean; duration?: number }) {
  const [pieces, setPieces] = useState<ConfettiPiece[]>([])

  useEffect(() => {
    if (active) {
      const newPieces: ConfettiPiece[] = Array.from({ length: 50 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        delay: Math.random() * 0.5,
        duration: 2 + Math.random() * 2,
        size: 8 + Math.random() * 8,
      }))
      setPieces(newPieces)

      const timeout = setTimeout(() => {
        setPieces([])
      }, duration)

      return () => clearTimeout(timeout)
    }
  }, [active, duration])

  if (!active || pieces.length === 0) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {pieces.map((piece) => (
        <div
          key={piece.id}
          className="absolute top-0"
          style={{
            left: `${piece.x}%`,
            width: piece.size,
            height: piece.size,
            backgroundColor: piece.color,
            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
            animation: `confetti-fall ${piece.duration}s linear ${piece.delay}s forwards`,
            transform: `rotate(${Math.random() * 360}deg)`,
          }}
        />
      ))}
    </div>
  )
}

export function useConfetti() {
  const [isActive, setIsActive] = useState(false)

  const trigger = () => {
    setIsActive(true)
    setTimeout(() => setIsActive(false), 100)
  }

  return { isActive, trigger, Confetti: () => <Confetti active={isActive} /> }
}
