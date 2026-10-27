// Asana's connection holds only a personal access token, kept as a credential,
// so the connection's settings carry nothing required.
export interface AsanaConfig {
  /** Override Asana's API address; rarely needed. */
  baseUrl?: string
}
