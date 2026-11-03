import type { AppHome } from "@viberglass/types";
import { AppHomeService } from "../../../../services/apps/AppHomeService";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const ENV = { APPS_DOMAIN: "apps.example.com", S3_BUCKET: "uploads", S3_REGION: "eu-west-1" };

function build(home: AppHome | null = null) {
  let stored = home;
  const settings = {
    getAppHome: jest.fn(async () => stored),
    setAppHome: jest.fn(async (next: AppHome | null) => {
      stored = next;
    }),
  };
  const creator = {
    listOwners: jest.fn(async () => [
      { name: "jane", kind: "user" as const },
      { name: "Acme", kind: "organization" as const },
    ]),
  };
  return { service: new AppHomeService(settings, creator, () => ENV), settings, creator };
}

describe("AppHomeService", () => {
  it("offers App spaces once the App home is set", async () => {
    const { service } = build();
    expect(await service.status()).toEqual({ home: null, availability: { available: false, missing: ["app_home"] } });

    const status = await service.set({ integrationId: "integration-1", credentialId: null, owner: "acme" }, "admin-1");

    expect(status).toEqual({
      home: { integrationId: "integration-1", credentialId: null, owner: "Acme" },
      availability: { available: true, missing: [] },
    });
  });

  it("refuses an owner the token can't create repositories under", async () => {
    const { service, settings, creator } = build();

    await expect(service.set({ integrationId: "integration-1", credentialId: "credential-1", owner: "globex" }, "admin-1"))
      .rejects.toMatchObject({ code: "OWNER_UNAVAILABLE", message: expect.stringContaining("jane, Acme") });
    expect(creator.listOwners).toHaveBeenCalledWith("integration-1", "credential-1");
    expect(settings.setAppHome).not.toHaveBeenCalled();
  });

  it("clears the App home", async () => {
    const { service, settings } = build({ integrationId: "integration-1", credentialId: null, owner: "Acme" });
    const status = await service.clear("admin-1");
    expect(settings.setAppHome).toHaveBeenCalledWith(null, "admin-1");
    expect(status.availability.missing).toEqual(["app_home"]);
  });
});
