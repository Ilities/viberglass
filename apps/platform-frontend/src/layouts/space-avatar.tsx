import { Avatar } from '@/components/avatar'
import type { Project } from '@/service/api/project-api'

export function SpaceAvatar({ space, slot }: { space: Pick<Project, 'name' | 'slug'>; slot: 'avatar' | 'icon' }) {
  if (space.slug === 'viberglass') return <Avatar size="1" slot={slot} src="/teams/viberglass.svg" />
  return <Avatar size="1" slot={slot} initials={space.name.substring(0, 2).toUpperCase()} className="bg-brand-gradient text-brand-charcoal" />
}
