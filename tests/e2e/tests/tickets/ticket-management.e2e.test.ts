import type { APIRequestContext } from "@playwright/test";
import { expect, test, TestHelpers } from "../../playwright/fixtures";
import {
  SUBMITTER_FIXTURES,
  type SubmitterTicketFixture,
} from "../../fixtures/submitterTickets";

interface SeededProject {
  id: string;
  slug: string;
}

interface SeededTicket {
  id: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readProject(value: unknown): SeededProject {
  if (!isRecord(value) || !isRecord(value.data))
    throw new Error("Project seed response is malformed");
  const { id, slug } = value.data;
  if (typeof id !== "string" || typeof slug !== "string")
    throw new Error("Project seed is missing its identity");
  return { id, slug };
}

function readTicket(value: unknown): SeededTicket {
  if (
    !isRecord(value) ||
    !isRecord(value.data) ||
    typeof value.data.id !== "string"
  ) {
    throw new Error("Ticket seed response is malformed");
  }
  return { id: value.data.id };
}

async function seedProject(
  request: APIRequestContext,
  backendURL: string,
): Promise<SeededProject> {
  const response = await request.post(`${backendURL}/api/projects`, {
    data: {
      name: `Submitter UX ${TestHelpers.generateUniqueId()}`,
      ticketSystem: "custom",
      autoFixEnabled: false,
      autoFixTags: [],
    },
  });
  expect(response.ok()).toBeTruthy();
  const body: unknown = await response.json();
  return readProject(body);
}

async function seedTicket(
  request: APIRequestContext,
  backendURL: string,
  projectId: string,
  fixture: SubmitterTicketFixture,
): Promise<SeededTicket> {
  const response = await request.post(`${backendURL}/api/tickets`, {
    data: {
      projectId,
      title: fixture.title,
      description: `Deterministic fixture for ${fixture.title}.`,
      workflowPhase: fixture.phase,
      workflowOverrideReason:
        fixture.phase === "research"
          ? undefined
          : "Seeded E2E fixture requires this workflow phase",
    },
  });
  expect(response.ok()).toBeTruthy();
  const body: unknown = await response.json();
  const ticket = readTicket(body);

  if (fixture.status !== "open" || fixture.pullRequestUrl) {
    const update = await request.put(`${backendURL}/api/tickets/${ticket.id}`, {
      data: {
        status: fixture.status,
        pullRequestUrl: fixture.pullRequestUrl,
      },
    });
    expect(update.ok()).toBeTruthy();
  }
  return ticket;
}

test.describe("Submitter-first ticket journey", () => {
  test("submits a minimal ticket into Research without operational concepts", async ({
    authenticatedPage: page,
    request,
    backendURL,
  }) => {
    const project = await seedProject(request, backendURL);
    await page.goto(`/project/${project.slug}/tickets/create`);

    await expect(
      page.getByRole("heading", { name: "Create New Ticket" }),
    ).toBeVisible();
    await expect(
      page.getByText("Every new ticket starts in Research"),
    ).toBeVisible();
    await expect(page.getByText("Optional details")).toBeVisible();
    await expect(page.getByText("Workflow Phase")).toHaveCount(0);

    const title = `Submit checkout issue ${TestHelpers.generateUniqueId()}`;
    await page.locator('input[name="title"]').fill(title);
    await page
      .locator('textarea[name="description"]')
      .fill("The checkout button does not respond.");
    await page.getByRole("button", { name: "Create Ticket" }).click();

    await expect(page).toHaveURL(
      new RegExp(`/project/${project.slug}/tickets/[a-f0-9-]+$`),
    );
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(
      page.getByText("Automation needs setup").first(),
    ).toBeVisible();
    await expect(page.getByText("(Current)").first()).toBeVisible();
  });

  test("groups seeded tickets directly into Research, Planning, and Execution", async ({
    authenticatedPage: page,
    request,
    backendURL,
  }) => {
    const project = await seedProject(request, backendURL);
    for (const fixture of SUBMITTER_FIXTURES) {
      await seedTicket(request, backendURL, project.id, fixture);
    }

    await page.goto(`/project/${project.slug}/tickets?status=all`);
    await expect(page.getByRole("heading", { name: "Research" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Planning" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Execution" }),
    ).toBeVisible();

    for (const fixture of SUBMITTER_FIXTURES) {
      await expect(
        page.getByRole("link", { name: fixture.title }),
      ).toBeVisible();
    }
  });

  test("requires one audited confirmation to skip directly to Execution", async ({
    authenticatedPage: page,
    request,
    backendURL,
  }) => {
    const project = await seedProject(request, backendURL);
    const fixture = SUBMITTER_FIXTURES[0];
    if (!fixture) throw new Error("Ready submitter fixture is missing");
    const ticket = await seedTicket(request, backendURL, project.id, fixture);
    await page.goto(`/project/${project.slug}/tickets/${ticket.id}`);

    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByText("Skip to execution…").click();
    await expect(
      page.getByRole("heading", { name: "Execute without Research/Planning" }),
    ).toBeVisible();
    await page
      .getByLabel("Override Reason")
      .fill("Production incident already has an externally reviewed plan.");
    await page.getByRole("button", { name: "Override to Execution" }).click();

    await expect(page.getByText("Execution").first()).toBeVisible();
    await expect(page.getByText("(Current)").first()).toBeVisible();
  });
});
