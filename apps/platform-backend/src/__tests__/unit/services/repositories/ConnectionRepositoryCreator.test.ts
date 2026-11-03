import type { Integration, IntegrationCredential } from "@viberglass/types";
import { RepositoryAccessError } from "@viberglass/integration-core";
import { ConnectionRepositoryCreator } from "../../../../services/repositories/ConnectionRepositoryCreator";
import { RepositoryCreationError } from "../../../../services/repositories/RepositoryCreationError";
import { fakeCreatingRepositoryHost, fakeRepositoryHost } from "../../../helpers/fakeRepositoryHost";

const CONNECTION: Integration = {
  id: "integration-1",
  name: "Company GitHub",
  system: "github",
  config: {},
  isActive: true,
  createdAt: "",
  updatedAt: "",
};

function token(overrides: Partial<IntegrationCredential> = {}): IntegrationCredential {
  return {
    id: "credential-1",
    integrationId: "integration-1",
    name: "Bot token",
    credentialType: "token",
    secretId: "secret-1",
    secretLocation: "database",
    isDefault: true,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

const CREATED = { fullName: "acme/laptops", url: "https://github.com/acme/laptops", defaultBranch: "main", isPrivate: true };

function build(options: { host?: ReturnType<typeof fakeRepositoryHost>; credential?: IntegrationCredential | null; secret?: string | null } = {}) {
  const host = fakeCreatingRepositoryHost();
  const credentials = {
    getById: jest.fn(async () => (options.credential === undefined ? token({ id: "credential-2", isDefault: false }) : options.credential)),
    getDefaultForIntegration: jest.fn(async () => (options.credential === undefined ? token() : options.credential)),
  };
  const secrets = { resolveSecretValue: jest.fn(async () => (options.secret === undefined ? " ghp_abc " : options.secret)) };
  const creator = new ConnectionRepositoryCreator(
    { getIntegration: jest.fn(async (id: string) => (id === CONNECTION.id ? CONNECTION : null)) },
    credentials,
    secrets,
    { get: () => ({ repository: options.host ?? host }) },
  );
  return { creator, host, credentials, secrets };
}

async function failure(promise: Promise<unknown>): Promise<RepositoryCreationError> {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  if (!(error instanceof RepositoryCreationError)) throw new Error(`Expected a RepositoryCreationError, got ${String(error)}`);
  return error;
}

describe("ConnectionRepositoryCreator", () => {
  it("lists owners with the connection's default token", async () => {
    const { creator, host, credentials } = build();
    host.creator.listOwners.mockResolvedValue([{ name: "jane", kind: "user" }]);

    await expect(creator.listOwners("integration-1", null)).resolves.toEqual([{ name: "jane", kind: "user" }]);
    expect(credentials.getDefaultForIntegration).toHaveBeenCalledWith("integration-1");
    expect(host.creator.listOwners).toHaveBeenCalledWith("ghp_abc");
  });

  it("creates with the chosen token, then checks it can push there", async () => {
    const { creator, host, credentials } = build();
    host.creator.createRepository.mockResolvedValue(CREATED);
    host.checkAccess.mockResolvedValue(CREATED);

    await expect(creator.create("integration-1", "credential-2", { owner: "acme", name: "laptops" })).resolves.toEqual(CREATED);
    expect(credentials.getById).toHaveBeenCalledWith("credential-2");
    expect(host.creator.createRepository).toHaveBeenCalledWith({ owner: "acme", name: "laptops" }, "ghp_abc");
    expect(host.checkAccess).toHaveBeenCalledWith({ fullName: "acme/laptops", url: "https://github.com/acme/laptops" }, "ghp_abc");
  });

  it("passes on the host's reason with a matching status", async () => {
    const { creator, host } = build();
    host.creator.createRepository.mockRejectedValue(new RepositoryAccessError("REPOSITORY_EXISTS", "There's already a repository called acme/laptops."));

    const error = await failure(creator.create("integration-1", null, { owner: "acme", name: "laptops" }));

    expect(error).toMatchObject({ code: "REPOSITORY_EXISTS", statusCode: 409, message: "There's already a repository called acme/laptops." });
  });

  it("says the repository was created when the token then can't push to it", async () => {
    const { creator, host } = build();
    host.creator.createRepository.mockResolvedValue(CREATED);
    host.checkAccess.mockRejectedValue(new RepositoryAccessError("REPOSITORY_READ_ONLY", "This token can read acme/laptops but can't push to it."));

    const error = await failure(creator.create("integration-1", null, { owner: "acme", name: "laptops" }));

    expect(error.code).toBe("REPOSITORY_READ_ONLY");
    expect(error.message).toMatch(/^Created acme\/laptops, but this token can't work in it yet\./);
  });

  it("refuses a token from another connection", async () => {
    const { creator, host } = build({ credential: token({ integrationId: "integration-2" }) });

    const error = await failure(creator.create("integration-1", "credential-1", { owner: "acme", name: "laptops" }));

    expect(error).toMatchObject({ code: "NO_TOKEN", statusCode: 409, message: "That access token can't be used with Company GitHub. Choose another one." });
    expect(host.creator.createRepository).not.toHaveBeenCalled();
  });

  it("asks which token to use when the connection has no default", async () => {
    const error = await failure(build({ credential: null }).creator.listOwners("integration-1", null));

    expect(error.message).toBe("Choose which Company GitHub access token to create the repository with.");
  });

  it("asks for a token when its secret is empty", async () => {
    const error = await failure(build({ secret: "  " }).creator.listOwners("integration-1", null));

    expect(error.code).toBe("NO_TOKEN");
  });

  it("says when the connection's code host can't create repositories", async () => {
    const error = await failure(build({ host: fakeRepositoryHost() }).creator.listOwners("integration-1", null));

    expect(error).toMatchObject({ code: "CREATION_UNSUPPORTED", statusCode: 400 });
  });

  it("says when the connection doesn't exist", async () => {
    const error = await failure(build().creator.listOwners("missing", null));

    expect(error).toMatchObject({ code: "CONNECTION_NOT_FOUND", statusCode: 404 });
  });
});
