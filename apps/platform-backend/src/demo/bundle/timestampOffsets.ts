/** A bundle stores each time as milliseconds from the moment it was exported. */
export function toOffset(at: Date, exportedAt: Date): number {
  return at.getTime() - exportedAt.getTime();
}

/** The latest time that had already passed at export; later ones are deadlines and expiries. */
export function newestPastOffset(offsets: Iterable<number>): number {
  let newest: number | null = null;
  for (const offset of offsets) {
    if (offset <= 0 && (newest === null || offset > newest)) newest = offset;
  }
  return newest ?? 0;
}

/** Maps offsets to times that put the newest activity `newestAgeMs` before `now`, keeping every gap. */
export function timestampShift(newestOffsetMs: number, now: Date, newestAgeMs: number): (offset: number) => Date {
  const base = now.getTime() - newestAgeMs - newestOffsetMs;
  return (offset) => new Date(base + offset);
}
