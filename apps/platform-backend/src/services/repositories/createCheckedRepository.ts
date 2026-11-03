import { RepositoryAccessError, type RepositoryCreator, type RepositoryHost } from "@viberglass/integration-core";
import type { NewRepository, RepositoryAccess } from "@viberglass/types";

/**
 * Creates the repository, then checks the token can push to it the way an
 * existing repository is checked: a token can be allowed to create a
 * repository without being given access to it.
 */
export async function createCheckedRepository(
  host: RepositoryHost,
  creator: RepositoryCreator,
  repository: NewRepository,
  token: string,
): Promise<RepositoryAccess> {
  const created = await creator.createRepository(repository, token);
  try {
    return await host.checkAccess({ fullName: created.fullName, url: created.url }, token);
  } catch (error) {
    if (!(error instanceof RepositoryAccessError)) throw error;
    throw new RepositoryAccessError(
      error.code,
      `Created ${created.fullName}, but this token can't work in it yet. ${error.message} Then use it as an existing repository.`,
    );
  }
}
