/** A public read-only demo: set by whoever deploys the instance, never from the app. */
export function isDemoInstance(): boolean {
  return process.env.VIBERGLASS_DEMO === "true";
}

/** The shared viewer account a demo's sign-in page shows; only on a demo instance. */
export function demoSignIn(): { email: string; password: string } | undefined {
  if (!isDemoInstance()) return undefined;
  const email = process.env.DEMO_VIEWER_EMAIL?.trim();
  const password = process.env.DEMO_VIEWER_PASSWORD;
  return email && password ? { email, password } : undefined;
}
