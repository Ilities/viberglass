/** A public read-only demo: set by whoever deploys the instance, never from the app. */
export function isDemoInstance(): boolean {
  return process.env.VIBERGLASS_DEMO === "true";
}
