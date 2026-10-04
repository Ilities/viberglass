import { createInviteSchema, registerSchema } from "../../../../api/middleware/schemas";

describe("account schemas", () => {
  it("accept an address on an internal domain, as a self-hosted workspace may use", () => {
    expect(registerSchema.validate({ email: "alex@acme.internal", name: "Alex", password: "long-enough" }).error).toBeUndefined();
    expect(createInviteSchema.validate({ email: "quinn@example.test", role: "guest" }).error).toBeUndefined();
  });

  it("still refuse something that isn't an address, naming the field", () => {
    const { error } = registerSchema.validate({ email: "alex", name: "Alex", password: "long-enough" });
    expect(error?.details.map((detail) => detail.path.join("."))).toEqual(["email"]);
  });
});
