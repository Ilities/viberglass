export type GitHubResponse = Pick<Response, 'ok' | 'status' | 'headers' | 'json'>

export type GitHubFetch = (url: string, init: RequestInit) => Promise<GitHubResponse>

/** Where GitHub's API is and how to call it. */
export interface GitHubApi {
  /** REST base without a trailing slash, such as https://api.github.com or https://host/api/v3 on Enterprise. */
  baseUrl: string
  fetch: GitHubFetch
}

export function restHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

/** Enterprise serves GraphQL at /api/graphql next to the REST /api/v3. */
export function graphqlUrlOf(baseUrl: string): string {
  return /\/api\/v3$/.test(baseUrl) ? baseUrl.replace(/\/api\/v3$/, '/api/graphql') : `${baseUrl}/graphql`
}
