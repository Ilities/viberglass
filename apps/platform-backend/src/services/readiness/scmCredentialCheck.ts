import type {
  ProjectReadinessCheck,
  ProjectScmConfig,
} from "@viberglass/types";
import type { IntegrationCredentialDAO } from "../../persistence/integrations";

export const EXPIRY_WARNING_MS = 7 * 24 * 3_600_000;

export async function scmCredentialCheck(
  projectSlug: string,
  scmConfig: ProjectScmConfig | null,
  credentials: Pick<IntegrationCredentialDAO, "getById">,
): Promise<ProjectReadinessCheck> {
  const remediationUrl = `/spaces/${projectSlug}/settings/repository`;
  if (!scmConfig?.integrationCredentialId) {
    return {
      key: "scmCredential",
      label: "SCM credential",
      state: "missing",
      code: "select_scm_credential",
      summary:
        "Select a credential that can read the repository and create pull requests.",
      remediationUrl,
    };
  }
  const credential = await credentials.getById(
    scmConfig.integrationCredentialId,
  );
  const expiresAt = credential?.expiresAt
    ? new Date(credential.expiresAt)
    : null;
  if (
    !credential ||
    credential.integrationId !== scmConfig.integrationId ||
    (expiresAt !== null && expiresAt.getTime() <= Date.now())
  ) {
    return {
      key: "scmCredential",
      label: "SCM credential",
      state: "invalid",
      code: "replace_expired_scm_credential",
      summary: credential
        ? "The selected SCM credential has expired."
        : "The selected SCM credential is no longer available.",
      remediationUrl,
    };
  }
  const expiresSoon =
    expiresAt !== null && expiresAt.getTime() - Date.now() <= EXPIRY_WARNING_MS;
  return {
    key: "scmCredential",
    label: "SCM credential",
    state: "ready",
    summary: "The selected SCM credential is available.",
    ...(expiresSoon && expiresAt
      ? {
          warning: `The SCM credential expires on ${expiresAt.toISOString().slice(0, 10)}. Replace it before then, or runs will stop.`,
          remediationUrl,
        }
      : {}),
  };
}
