import { SetupAppHomeService } from "../../../../services/setup/SetupAppHomeService";

jest.mock("../../../../services/setup/SetupRepositoryService", () => ({ SetupRepositoryService: jest.fn() }));
jest.mock("../../../../services/apps/createAppSpaceServices", () => ({ createAppHomeService: jest.fn() }));

describe("SetupAppHomeService", () => {
  it("saves the checked token, then makes it the App home for the owner", async () => {
    const saved = { integrationId: "integration-1", credentialId: "credential-1", owner: "Acme" };
    const status = { home: saved, availability: { available: true, missing: [] } };
    const saveCreatingToken = jest.fn(async () => saved);
    const set = jest.fn(async () => status);

    const result = await new SetupAppHomeService({ saveCreatingToken }, { set }).saveAppHome("acme", "ghp_abc", "user-1");

    expect(saveCreatingToken).toHaveBeenCalledWith("acme", "ghp_abc");
    expect(set).toHaveBeenCalledWith(saved, "user-1");
    expect(result).toBe(status);
  });

  it("leaves the App home alone when the token check fails", async () => {
    const set = jest.fn();
    const saveCreatingToken = jest.fn(async () => {
      throw new Error("This token can't create repositories.");
    });

    await expect(new SetupAppHomeService({ saveCreatingToken }, { set }).saveAppHome("acme", "t", null)).rejects.toThrow(
      "This token can't create repositories.",
    );
    expect(set).not.toHaveBeenCalled();
  });
});
