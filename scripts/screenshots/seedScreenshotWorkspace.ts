/**
 * Fills an empty Viberglass database with a product team's workspace, for the
 * screenshots in the guide and on the website. Never run it against a database
 * with real data: it writes rows directly and backdates them.
 *
 *   DB_HOST=127.0.0.1 DB_PORT=5442 DB_NAME=viberglass DB_USER=viberglass DB_PASSWORD=viberglass-local \
 *   S3_BUCKET=viberglass S3_ENDPOINT=http://localhost:9100 S3_FORCE_PATH_STYLE=true S3_REGION=us-east-1 \
 *   S3_ACCESS_KEY_ID=viberglass S3_SECRET_ACCESS_KEY=viberglass-local \
 *   SEED_ADMIN_EMAIL=you@example.com SEED_ADMIN_PASSWORD=... \
 *   NODE_PATH=apps/platform-backend/node_modules npx tsx scripts/screenshots/seedScreenshotWorkspace.ts
 */
import { randomBytes } from "crypto";
import { NATIVE_TICKET_ORIGIN, type Project } from "@viberglass/types";
import { hashPassword } from "../../apps/platform-backend/src/api/auth/utils";
import db from "../../apps/platform-backend/src/persistence/config/database";
import { ClankerDAO } from "../../apps/platform-backend/src/persistence/clanker/ClankerDAO";
import { DeploymentStrategyDAO } from "../../apps/platform-backend/src/persistence/clanker/DeploymentStrategyDAO";
import { IntegrationCredentialDAO } from "../../apps/platform-backend/src/persistence/integrations/IntegrationCredentialDAO";
import { IntegrationDAO } from "../../apps/platform-backend/src/persistence/integrations/IntegrationDAO";
import { ProjectDAO } from "../../apps/platform-backend/src/persistence/project/ProjectDAO";
import { ProjectScmConfigDAO } from "../../apps/platform-backend/src/persistence/project/ProjectScmConfigDAO";
import { SpaceMemberDAO } from "../../apps/platform-backend/src/persistence/project/SpaceMemberDAO";
import { SecretDAO } from "../../apps/platform-backend/src/persistence/secret/SecretDAO";
import { TicketDAO } from "../../apps/platform-backend/src/persistence/ticketing/TicketDAO";
import { UserDAO } from "../../apps/platform-backend/src/persistence/user/UserDAO";
import { TicketLifecycleStatusService } from "../../apps/platform-backend/src/services/TicketLifecycleStatusService";
import { PEOPLE } from "./content";
import { seedPayments, seedProductMarketing, seedTokenObserver } from "./otherSpaces";
import { lastTouched, settleUpdatedTimes, type Runner } from "./seedSupport";
import { seedStorefront, type Person } from "./storefront";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}`);
  return value;
}

async function person(name: string, email: string, role: "admin" | "member", password?: string): Promise<Person> {
  const passwordHash = await hashPassword(password ?? randomBytes(24).toString("hex"));
  const user = await new UserDAO().createUser({ name, email, passwordHash, role });
  return { id: user.id, name, email };
}

async function runners(): Promise<{ claude: Runner; opencode: Runner }> {
  const secrets = new SecretDAO();
  const anthropic = await secrets.createSecret({ name: "Anthropic API key", secretLocation: "env", sourceEnvVar: "ANTHROPIC_API_KEY" });
  const opencodeKey = await secrets.createSecret({ name: "OpenCode Go key", secretLocation: "env", sourceEnvVar: "OPENCODE_API_KEY" });
  const docker = await new DeploymentStrategyDAO().getDeploymentStrategyByName("docker");
  const clankers = new ClankerDAO();
  const claude = await clankers.createClanker({
    name: "Claude Code",
    description: "The default agent for code spaces.",
    deploymentStrategyId: docker?.id ?? null,
    agent: "claude-code",
    deploymentConfig: { version: 1, strategy: { type: "docker", containerImage: "viberator-worker-claude:e2e" }, agent: { type: "claude-code" } },
    secretBindings: [{ envVar: "ANTHROPIC_API_KEY", secretId: anthropic.id }],
  });
  const opencode = await clankers.createClanker({
    name: "OpenCode · GLM",
    description: "A cheaper agent for small changes.",
    deploymentStrategyId: docker?.id ?? null,
    agent: "opencode",
    deploymentConfig: { version: 1, strategy: { type: "docker", containerImage: "viberator-worker-opencode:e2e" }, agent: { type: "opencode", model: "zai/glm-5" } },
    secretBindings: [{ envVar: "OPENCODE_API_KEY", secretId: opencodeKey.id }],
  });
  await clankers.updateStatus(claude.id, "active");
  await clankers.updateStatus(opencode.id, "active");
  return {
    claude: { id: claude.id, name: claude.name, agent: "claude-code", model: "claude-sonnet-5", harnessVersion: "2.4.1" },
    opencode: { id: opencode.id, name: opencode.name, agent: "opencode", model: "zai/glm-5", harnessVersion: "1.3.8" },
  };
}

async function github() {
  const integration = await new IntegrationDAO().createIntegration({ name: "GitHub", system: "github", config: {} });
  const secret = await new SecretDAO().createSecret({ name: "GitHub token (acme-bot)", secretLocation: "env", sourceEnvVar: "GITHUB_TOKEN" });
  const credential = await new IntegrationCredentialDAO().create({ integrationId: integration.id, name: "acme-bot", credentialType: "token", secretId: secret.id, isDefault: true });
  return { id: integration.id, credentialId: credential.id };
}

async function space(
  name: string,
  options: { backing: "git" | "files"; repository?: string; private?: boolean; maintainer: Person; members: Person[]; github: { id: string; credentialId: string }; defaultAgentId: string },
): Promise<Project> {
  const projects = new ProjectDAO();
  const project = await projects.createProject(
    {
      name,
      ticketSystem: NATIVE_TICKET_ORIGIN,
      credentials: { type: "token" },
      autoFixEnabled: false,
      autoFixTags: [],
      customFieldMappings: {},
      isPrivate: options.private ?? false,
      backingKind: options.backing,
    },
    options.maintainer.id,
  );
  await projects.updateProject(project.id, { defaultAgentId: options.defaultAgentId });
  for (const member of options.members.filter((m) => m.id !== options.maintainer.id)) {
    await new SpaceMemberDAO().upsert({ projectId: project.id, userId: member.id, role: "member", addedBy: options.maintainer.id });
  }
  if (options.repository) {
    await new ProjectScmConfigDAO().upsertByProjectId(project.id, {
      integrationId: options.github.id,
      sourceRepository: options.repository,
      baseBranch: "main",
      integrationCredentialId: options.github.credentialId,
    });
  }
  return project;
}

async function main(): Promise<void> {
  // Screenshots are taken as Maria, the product manager.
  const maria = await person(PEOPLE.maria.name, required("SEED_ADMIN_EMAIL"), "admin", required("SEED_ADMIN_PASSWORD"));
  const you = maria;
  const dev = await person(PEOPLE.dev.name, PEOPLE.dev.email, "member");
  const aino = await person(PEOPLE.aino.name, PEOPLE.aino.email, "member");
  const tomi = await person(PEOPLE.tomi.name, PEOPLE.tomi.email, "member");
  const { claude, opencode } = await runners();
  const gh = await github();
  const everyone = [you, dev, aino, tomi];

  // The sidebar lists the newest space first.
  const storefrontRepository = "https://github.com/acme/storefront";
  const payments = await space("Payments", { backing: "git", repository: "https://github.com/acme/payments", private: true, maintainer: dev, members: [you], github: gh, defaultAgentId: claude.id });
  const observer = await space("token.observer", { backing: "git", repository: "https://github.com/ilities/token.observer", maintainer: dev, members: [you], github: gh, defaultAgentId: claude.id });
  const marketing = await space("Product marketing", { backing: "files", maintainer: maria, members: [you, aino, tomi], github: gh, defaultAgentId: claude.id });
  const storefront = await space("Storefront", { backing: "git", repository: storefrontRepository, maintainer: maria, members: everyone, github: gh, defaultAgentId: claude.id });

  const { done } = await seedStorefront({ projectId: storefront.id, repository: storefrontRepository, claude, opencode, you, maria, dev, aino, tomi });
  await seedProductMarketing({ projectId: marketing.id, claude, you, maria, aino, tomi });
  await seedTokenObserver({ projectId: observer.id, claude, github: gh, you, dev });
  await seedPayments({ projectId: payments.id, you, dev });

  const lifecycle = new TicketLifecycleStatusService();
  const tickets = new TicketDAO();
  const all = await db.selectFrom("tickets").select("id").execute();
  for (const { id } of all) await lifecycle.synchronize(id);
  for (const id of done) await tickets.updateTicket(id, { status: "resolved" });
  for (const { id } of all) if (!lastTouched.has(id)) lastTouched.set(id, new Date());
  await settleUpdatedTimes();
  // You've caught up on everything except the newest message on the free shipping task.
  await db
    .insertInto("task_reads")
    .values(all.map(({ id }) => ({ ticket_id: id, user_id: you.id, last_read_at: new Date() })))
    .onConflict((oc) => oc.columns(["ticket_id", "user_id"]).doUpdateSet({ last_read_at: new Date() }))
    .execute();
  await db
    .updateTable("task_reads")
    .set({ last_read_at: new Date(Date.now() - 21 * 3_600_000) })
    .where("user_id", "=", you.id)
    .where("ticket_id", "in", db.selectFrom("tickets").select("id").where("title", "like", "Free shipping%"))
    .execute();
  console.log(`Seeded ${all.length} tasks in 4 spaces. Sign in as ${you.email}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.destroy());
