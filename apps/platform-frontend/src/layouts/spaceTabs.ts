export interface SpaceTab {
  label: string
  href: string
  current: boolean
}

/** A space's pages: its work, what runs on a timer, how the agents did, each run, then its settings. */
export function spaceTabs({
  slug,
  pathname,
  files,
  runner,
  canMaintain,
}: {
  slug: string
  pathname: string
  /** A Files space, which has working files and artifacts. */
  files: boolean
  runner: boolean
  canMaintain: boolean
}): SpaceTab[] {
  const base = `/spaces/${slug}`
  const tabs = [
    { label: 'Tasks', href: base },
    ...(files
      ? [
          { label: 'Files', href: `${base}/files` },
          { label: 'Artifacts', href: `${base}/artifacts` },
        ]
      : []),
    ...(runner
      ? [
          { label: 'Schedules', href: `${base}/schedules` },
          { label: 'Track record', href: `${base}/track-record` },
          { label: 'Runs', href: `${base}/runs` },
        ]
      : []),
    { label: canMaintain ? 'Settings' : 'About', href: `${base}/settings` },
  ]
  return tabs.map((tab) => ({
    ...tab,
    current: tab.href === base ? pathname === base : pathname === tab.href || pathname.startsWith(`${tab.href}/`),
  }))
}
