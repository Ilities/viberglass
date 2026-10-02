import { createHmac, randomUUID } from "node:crypto";
import { expect, test } from "../../playwright/smokeFixtures";
import { runStatus, timeline } from "../../playwright/tasks";

const SECRET = "e2e-github-webhook-secret";

test("an issue a webhook builds on its own becomes a task whose build is a turn in its thread", async ({
  adminApi,
  adminPage: page,
  workspace,
}) => {
  test.setTimeout(180_000);
  // A repository name of its own, so this run's config is the one the delivery finds.
  const repository = `e2e-org/webhook-${randomUUID().slice(0, 8)}`;
  const integrations = await (await adminApi.get("/api/integrations")).json();
  const github = (integrations?.data ?? integrations).find((integration: { system: string }) => integration.system === "github");
  const configured = await adminApi.post(`/api/integrations/${github.id}/webhooks/inbound`, {
    data: {
      projectId: workspace.projectId,
      providerProjectId: repository,
      allowedEvents: ["issues.opened"],
      autoExecute: true,
      webhookSecret: SECRET,
    },
  });
  expect(configured.ok()).toBe(true);

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
    repository: { full_name: repository, name: repository.split("/")[1], owner: { login: "e2e-org" } },
    sender: { login: "e2e-reporter" },
  });
  const delivered = await adminApi.post("/api/webhooks/github", {
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

  // The build is the task's turn, like one a person asked for, and finishes like one.
  const turn = (await timeline(adminApi, ticketId)).find((entry) => entry.kind === "agent_turn");
  expect(turn).toMatchObject({ action: "code", jobId });
  await expect.poll(() => runStatus(adminApi, jobId), { timeout: 120_000 }).toBe("completed");

  await page.goto(`/spaces/${workspace.projectSlug}/tasks/${ticketId}`);
  const thread = page.getByRole("region", { name: "Thread" });
  await expect(thread.getByText("asked for the build")).toBeVisible();
  // Nobody asked, so nothing was posted in anyone's name.
  expect((await timeline(adminApi, ticketId)).filter((entry) => entry.kind === "message")).toEqual([]);
});
