import express from "express";
import request from "supertest";
import { loginRateLimit } from "../../../../api/middleware/loginRateLimit";

function appSigningIn(password: string) {
  const app = express();
  app.use(express.json());
  app.post("/login", loginRateLimit(), (req, res) => {
    if (req.body.password === password) return res.json({ ok: true });
    return res.status(401).json({ error: "Invalid email or password" });
  });
  return app;
}

describe("loginRateLimit", () => {
  it("refuses an address after ten failed sign-ins", async () => {
    const app = appSigningIn("right");
    for (let attempt = 0; attempt < 10; attempt++) {
      await request(app).post("/login").send({ password: "wrong" }).expect(401);
    }
    const refused = await request(app).post("/login").send({ password: "right" }).expect(429);
    expect(refused.body.error).toBe("Too many failed sign-ins. Try again in 15 minutes.");
  });

  it("doesn't count sign-ins that succeed", async () => {
    const app = appSigningIn("right");
    for (let attempt = 0; attempt < 15; attempt++) {
      await request(app).post("/login").send({ password: "right" }).expect(200);
    }
    await request(app).post("/login").send({ password: "wrong" }).expect(401);
  });
});
