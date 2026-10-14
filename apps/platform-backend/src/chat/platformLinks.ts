import type { TurnArtifact } from "@viberglass/types";

const frontendBase = () => process.env.PLATFORM_FRONTEND_URL?.replace(/\/$/, "");

export function ticketUrl(projectSlug: string, ticketId: string): string | null {
  const base = frontendBase();
  return base ? `${base}/spaces/${projectSlug}/tasks/${ticketId}` : null;
}

/** An artifact's page, at the version named. */
export function artifactUrl(projectSlug: string, artifactId: string, versionId: string): string | null {
  const base = frontendBase();
  return base ? `${base}/spaces/${projectSlug}/artifacts/${artifactId}?version=${versionId}` : null;
}

/** The artifacts a turn produced, a line each, linked to the version it made: "**Artifact:** [Report](…) v2". Null for none. */
export function artifactsMarkdown(projectSlug: string, artifacts: TurnArtifact[]): string | null {
  if (artifacts.length === 0) return null;
  return artifacts
    .map((artifact) => {
      const url = artifactUrl(projectSlug, artifact.artifactId, artifact.versionId);
      return `**Artifact:** ${url ? `[${artifact.title}](${url})` : artifact.title} v${artifact.number}`;
    })
    .join("\n");
}
