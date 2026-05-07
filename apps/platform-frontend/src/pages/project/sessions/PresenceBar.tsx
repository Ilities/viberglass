import { getUserColor, getUserInitials } from './TranscriptPanel'
import type { ParticipantInfo } from '@/service/api/session-api'

interface PresenceBarProps {
  presentUsers: ParticipantInfo[]
}

function AvatarCircle({ user, index }: { user: ParticipantInfo; index: number }) {
  const color = getUserColor(user.userId)
  const initials = getUserInitials(user.name)
  const offset = index > 0 ? -6 : 0

  return (
    <span
      className="relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-[var(--gray-1)] text-[10px] font-semibold text-white ring-1 ring-[var(--gray-6)]"
      style={offset ? { marginLeft: offset } : undefined}
      title={user.name}
    >
      {user.avatarUrl ? (
        <img src={user.avatarUrl} alt={user.name} className="h-full w-full rounded-full object-cover" />
      ) : (
        <span className={color + ' h-full w-full rounded-full flex items-center justify-center'}>
          {initials}
        </span>
      )}
    </span>
  )
}

export function PresenceBar({ presentUsers }: PresenceBarProps) {
  if (presentUsers.length === 0) return null

  const maxVisible = 5
  const visible = presentUsers.slice(0, maxVisible)
  const overflow = presentUsers.length - maxVisible

  return (
    <div className="flex items-center" title="Currently viewing">
      {visible.map((user, i) => (
        <AvatarCircle key={user.userId} user={user} index={i} />
      ))}
      {overflow > 0 && (
        <span className="relative z-10 -ml-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-[var(--gray-1)] bg-[var(--gray-4)] text-[10px] font-medium text-[var(--gray-11)] ring-1 ring-[var(--gray-6)]">
          +{overflow}
        </span>
      )}
    </div>
  )
}
