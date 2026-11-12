import type { BundlePin } from "../bundle/bundleManifest";

export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

interface Queryable {
  query(text: string, values: unknown[]): Promise<unknown>;
}

/** Pins the bundle's pins to the viewer's Home in a new random order, each after the last, as pinning in the app does. */
export class ViewerPins {
  constructor(
    private readonly db: Queryable,
    private readonly random: () => number = Math.random,
  ) {}

  async apply(userId: string, pins: readonly BundlePin[]): Promise<void> {
    for (const pin of shuffled(pins, this.random)) {
      await this.db.query(
        `INSERT INTO user_pins (user_id, artifact_id, app_project_id, title, position)
         VALUES ($1, $2, $3, $4, (SELECT coalesce(max(position) + 1, 0) FROM user_pins WHERE user_id = $1))
         ON CONFLICT DO NOTHING`,
        [userId, pin.target.kind === "artifact" ? pin.target.artifactId : null, pin.target.kind === "app" ? pin.target.spaceId : null, pin.title],
      );
    }
  }
}
