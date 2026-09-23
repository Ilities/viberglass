import { APIRequestContext, Browser, Page, test as base } from "@playwright/test";
import { E2E } from "./e2eEnvironment";
import { signIn, SignedInSession } from "./seedWorkspace";
import type { SeededWorkspace } from "./seedWorkspace";
import { seededWorkspace } from "./seededWorkspace";

interface SmokeFixtures {
  workspace: SeededWorkspace;
  adminSession: SignedInSession;
  memberSession: SignedInSession;
  adminApi: APIRequestContext;
  memberApi: APIRequestContext;
  adminPage: Page;
  memberPage: Page;
}

/** Opens a page that is already signed in, instead of clicking through login. */
async function signedInPage(browser: Browser, session: SignedInSession) {
  const context = await browser.newContext({ storageState: await session.api.storageState() });
  await context.addInitScript((token) => {
    // about:blank has no localStorage; only app pages need the token.
    if (window.location.protocol.startsWith("http")) {
      window.localStorage.setItem("auth_token", token);
    }
  }, session.token);
  return { context, page: await context.newPage() };
}

export const test = base.extend<SmokeFixtures>({
  workspace: async ({}, use) => {
    await use(seededWorkspace());
  },
  adminSession: async ({}, use) => {
    const session = await signIn(E2E.admin);
    await use(session);
    await session.api.dispose();
  },
  memberSession: async ({}, use) => {
    const session = await signIn(E2E.member);
    await use(session);
    await session.api.dispose();
  },
  adminApi: async ({ adminSession }, use) => {
    await use(adminSession.api);
  },
  memberApi: async ({ memberSession }, use) => {
    await use(memberSession.api);
  },
  adminPage: async ({ browser, adminSession }, use) => {
    const { context, page } = await signedInPage(browser, adminSession);
    await use(page);
    await context.close();
  },
  memberPage: async ({ browser, memberSession }, use) => {
    const { context, page } = await signedInPage(browser, memberSession);
    await use(page);
    await context.close();
  },
});

export { expect } from "@playwright/test";
