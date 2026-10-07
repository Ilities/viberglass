import type { UserRecord } from "../../../../persistence/user/UserDAO";
import { ForgotPasswordService } from "../../../../services/people/ForgotPasswordService";

const MARIA: UserRecord = {
  id: "u-1",
  email: "maria@example.com",
  name: "Maria",
  passwordHash: "x",
  avatarUrl: null,
  role: "member",
  createdAt: new Date(),
  updatedAt: new Date(),
  deactivatedAt: null,
};

function setup(options: { user?: UserRecord | null; emailConfigured?: boolean; frontendUrl?: string } = {}) {
  let now = 1_000_000;
  const users = { findByEmail: jest.fn().mockResolvedValue(options.user === undefined ? MARIA : options.user) };
  const resets = { createLink: jest.fn().mockResolvedValue("tok") };
  const email = { isConfigured: () => options.emailConfigured ?? true, send: jest.fn().mockResolvedValue(undefined) };
  const service = new ForgotPasswordService({
    users,
    resets,
    email,
    frontendUrl: "frontendUrl" in options ? options.frontendUrl : "https://app.example.com/",
    now: () => now,
  });
  return { users, resets, email, service, advance: (ms: number) => (now += ms) };
}

describe("ForgotPasswordService", () => {
  it("emails an active account a reset link it asked for itself", async () => {
    const { resets, email, service } = setup();

    await service.request("maria@example.com");

    expect(resets.createLink).toHaveBeenCalledWith("u-1", null);
    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "maria@example.com", text: expect.stringContaining("https://app.example.com/reset-password/tok") }),
    );
  });

  it("sends nothing for an unknown or deactivated address", async () => {
    for (const user of [null, { ...MARIA, deactivatedAt: new Date() }]) {
      const { resets, email, service } = setup({ user });
      await service.request("maria@example.com");
      expect(resets.createLink).not.toHaveBeenCalled();
      expect(email.send).not.toHaveBeenCalled();
    }
  });

  it("can't email without a transport or the app's address", async () => {
    for (const options of [{ emailConfigured: false }, { frontendUrl: undefined }]) {
      const { users, service } = setup(options);
      expect(service.canEmail()).toBe(false);
      await service.request("maria@example.com");
      expect(users.findByEmail).not.toHaveBeenCalled();
    }
  });

  it("sends one email a minute per address", async () => {
    const { email, service, advance } = setup();

    await service.request("maria@example.com");
    await service.request("maria@example.com");
    advance(61_000);
    await service.request("maria@example.com");

    expect(email.send).toHaveBeenCalledTimes(2);
  });

  it("swallows a failure to send", async () => {
    const { email, service } = setup();
    email.send.mockRejectedValue(new Error("smtp down"));

    await expect(service.request("maria@example.com")).resolves.toBeUndefined();
  });
});
