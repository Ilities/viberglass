import express from "express";
import request from "supertest";
import {
  registerRepositoryOwnerRoutes,
  registerSpaceRepositoryCreationRoutes,
} from "../../../../api/routes/repositoryCreationRoutes";
import { applicationErrorHandler } from "../../../../api/middleware/notFoundHandling";
import { RepositoryCreationError } from "../../../../services/repositories/RepositoryCreationError";

const SPACE_ID = "11111111-1111-4111-8111-111111111111";
const CONNECTION_ID = "22222222-2222-4222-8222-222222222222";
const TOKEN_ID = "33333333-3333-4333-8333-333333333333";
const CREATED = { fullName: "acme/laptops", url: "https://github.com/acme/laptops", defaultBranch: "main", isPrivate: true };

function app() {
  const creator = { listOwners: jest.fn(), create: jest.fn() };
  const projects = {
    getProject: jest.fn(async (id: string): Promise<{ id: string; backingKind: "git" | "files" } | null> =>
      id === SPACE_ID ? { id, backingKind: "git" } : null,
    ),
  };
  const links = { isLinked: jest.fn(async () => true) };
  const integrations = express.Router();
  registerRepositoryOwnerRoutes(integrations, creator);
  const spaces = express.Router();
  registerSpaceRepositoryCreationRoutes(spaces, { projects, links, creator });
  const server = express();
  server.use(express.json());
  server.use("/api/integrations", integrations);
  server.use("/api/spaces", spaces);
  server.use(applicationErrorHandler);
  return { server, creator, projects, links };
}

describe("repository creation routes", () => {
  it("lists owners with the chosen token", async () => {
    const { server, creator } = app();
    creator.listOwners.mockResolvedValue([{ name: "jane", kind: "user" }]);

    const response = await request(server).get(`/api/integrations/${CONNECTION_ID}/repository-owners?credentialId=${TOKEN_ID}`).expect(200);

    expect(response.body.data).toEqual([{ name: "jane", kind: "user" }]);
    expect(creator.listOwners).toHaveBeenCalledWith(CONNECTION_ID, TOKEN_ID);
  });

  it("lists owners with the default token when none is chosen", async () => {
    const { server, creator } = app();
    creator.listOwners.mockResolvedValue([]);

    await request(server).get(`/api/integrations/${CONNECTION_ID}/repository-owners`).expect(200);

    expect(creator.listOwners).toHaveBeenCalledWith(CONNECTION_ID, null);
  });

  it("creates a repository for a space with its linked code host", async () => {
    const { server, creator, links } = app();
    creator.create.mockResolvedValue(CREATED);

    const response = await request(server)
      .post(`/api/spaces/${SPACE_ID}/repositories`)
      .send({ integrationId: CONNECTION_ID, integrationCredentialId: TOKEN_ID, owner: "acme", name: "laptops" })
      .expect(201);

    expect(response.body.data).toEqual(CREATED);
    expect(links.isLinked).toHaveBeenCalledWith(SPACE_ID, CONNECTION_ID);
    expect(creator.create).toHaveBeenCalledWith(CONNECTION_ID, TOKEN_ID, { owner: "acme", name: "laptops" });
  });

  it("shows the plain-language reason when the host refuses", async () => {
    const { server, creator } = app();
    creator.create.mockRejectedValue(new RepositoryCreationError("CREATE_FORBIDDEN", "This token can't create repositories in acme: it needs more."));

    const response = await request(server)
      .post(`/api/spaces/${SPACE_ID}/repositories`)
      .send({ integrationId: CONNECTION_ID, owner: "acme", name: "laptops" })
      .expect(422);

    expect(response.body.error).toBe("This token can't create repositories in acme: it needs more.");
    expect(creator.create).toHaveBeenCalledWith(CONNECTION_ID, null, { owner: "acme", name: "laptops" });
  });

  it("refuses a code host that isn't linked to the space", async () => {
    const { server, creator, links } = app();
    links.isLinked.mockResolvedValue(false);

    await request(server)
      .post(`/api/spaces/${SPACE_ID}/repositories`)
      .send({ integrationId: CONNECTION_ID, owner: "acme", name: "laptops" })
      .expect(409);

    expect(creator.create).not.toHaveBeenCalled();
  });

  it("refuses a Files space", async () => {
    const { server, creator, projects } = app();
    projects.getProject.mockResolvedValue({ id: SPACE_ID, backingKind: "files" });

    await request(server)
      .post(`/api/spaces/${SPACE_ID}/repositories`)
      .send({ integrationId: CONNECTION_ID, owner: "acme", name: "laptops" })
      .expect(409);

    expect(creator.create).not.toHaveBeenCalled();
  });

  it("needs an owner and a name", async () => {
    const { server, creator } = app();

    await request(server).post(`/api/spaces/${SPACE_ID}/repositories`).send({ integrationId: CONNECTION_ID, owner: "acme" }).expect(400);

    expect(creator.create).not.toHaveBeenCalled();
  });
});
