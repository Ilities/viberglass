/**
 * What every harness and integration plugin says about itself: plain data the
 * backend, the frontend and the build scripts can all read.
 */
export interface PluginManifest {
  /** Unique, kebab-case; stored on the records that use the plugin. */
  id: string
  /** Name shown in the UI and logs. */
  label: string
  /** One sentence shown under the name. */
  description: string
}
