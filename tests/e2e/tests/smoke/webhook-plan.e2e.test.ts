import { createHmac, randomUUID } from "node:crypto";
import type { APIRequestContext, APIResponse } from "@playwright/test";
import { E2E } from "../../playwright/e2eEnvironment";
import { expect, test } from "../../playwright/smokeFixtures";
import { planDocument, runStatus, timeline } from "../../playwright/tasks";

const SECRET = "e2e-github-webhook-secret";

async function data(response: APIResponse, what: string) {
  if (!response.ok()) throw new Error(`${what} failed: ${response.status()} ${await response.text()}`);
  const body = await response.json();
  return body?.data ?? body;
}

/** A space on the fixture repository under `owner/fixture`, so a GitHub issue from that repository can go to it. */
async function createSpaceOnRepository(api: APIRequestContext, owner: string) {
  const integrations = await data(await api.get("/api/integrations"), "Listing integrations");
  const scm = integrations.find((integration: { system: string }) => integration.system === "github");
  const space = await data(await api.post("/api/spaces", { data: { name: `Issues ${owner}` } }), "Creating the space");
  await data(
    await api.post(`/api/integrations/space/${space.id}/link`, { data: { integrationId: scm.id, isPrimary: true } }),
    "Linking the repository connection",
  );
  await data(
    await api.put(`/api/spaces/${space.id}/scm-config`, {
      data: {
        integrationId: scm.id,
        sourceRepository: E2E.workerReachableRepositoryUrl.replace("/fixture.git", `/${owner}/fixture.git`),
        baseBranch: "main",
      },
    }),
    "Configuring the repository",
  );
  return { projectId: String(space.id), projectSlug: String(space.slug) };
}

test("an issue a space takes becomes a task whose plan is a turn in its thread", async ({ adminApi, adminPage: page }) => {
  test.setTimeout(180_000);
  const owner = `e2e-org-${randomUUID().slice(0, 8)}`;
  const repository = `${owner}/fixture`;
  const space = await createSpaceOnRepository(adminApi, owner);

  // A connection of its own, with its webhook, and the space taking every issue with its plan written.
  const connection = await data(
    await adminApi.post("/api/integrations", { data: { name: `GitHub ${owner}`, system: "github", config: {} } }),
    "Creating the connection",
  );
  const webhook = await data(
    await adminApi.post(`/api/integrations/${connection.id}/webhooks/inbound`, { data: { webhookSecret: SECRET } }),
    "Creating the webhook",
  );
  await data(
    await adminApi.put(`/api/integrations/space/${space.projectId}/issue-rules/${connection.id}`, {
      data: { rules: [{ label: null, planNewIssues: true }] },
    }),
    "Saving the space's issue rules",
  );

  const body = JSON.stringify({
    action: "opened",
    issue: {
      number: 7,
      title: "The sign-up button does nothing",
      body: "Clicking it on mobile shows no error and no form.",
      html_url: `https://github.com/${repository}/issues/7`,
      state: "open",
      labels: [],
      user: { login: "e2e-reporter" },
    },
    repository: { full_name: repository, name: "fixture", owner: { login: owner } },
    sender: { login: "e2e-reporter" },
  });
  const delivered = await adminApi.post(`/api/webhooks/github/${webhook.id}`, {
    headers: {
      "content-type": "application/json",
      "x-github-event": "issues",
      "x-github-delivery": randomUUID(),
      "x-hub-signature-256": `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`,
    },
    data: body,
  });
  expect(delivered.status()).toBe(200);
  const { ticketId, jobId } = await delivered.json();
  expect(ticketId).toBeTruthy();
  expect(jobId).toBeTruthy();

  // The plan is the task's turn, like one a person asked for, and finishes like one.
  const turn = (await timeline(adminApi, ticketId)).find((entry) => entry.kind === "agent_turn");
  expect(turn).toMatchObject({ action: "plan", jobId });
  await expect.poll(() => runStatus(adminApi, jobId), { timeout: 120_000 }).toBe("completed");
  expect(await planDocument(adminApi, ticketId)).toContain("# Fake Plan");

  await page.goto(`/spaces/${space.projectSlug}/tasks/${ticketId}`);
  const thread = page.getByRole("region", { name: "Conversation" });
  await expect(thread.getByText("asked for the plan")).toBeVisible();
  // Nobody asked, so nothing was posted in anyone's name.
  expect((await timeline(adminApi, ticketId)).filter((entry) => entry.kind === "message")).toEqual([]);
});
