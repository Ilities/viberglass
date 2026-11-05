import type { AppInstanceStatus } from "@viberglass/types";
import { AppInstanceRunner } from "../../../../services/apps/AppInstanceRunner";
import { appRelease, fakeAppHost } from "../../../helpers/fakeAppHost";

const RELEASE = appRelease("r1");
const SPEC = { instance: "app-space-1", projectId: "space-1", image: "runtime", env: { PORT: "3000" } };
const EXPIRES = new Date("2026-11-12T12:00:00Z");

function build(answers: Array<number | null>, timeoutMs = 10_000) {
  const host = fakeAppHost();
  const specs = { specFor: jest.fn(async () => ({ spec: SPEC, credentialsExpireAt: EXPIRES })) };
  const apps = { recordCredentials: jest.fn(async () => undefined) };
  const probe = { status: jest.fn(async () => (answers.length > 1 ? answers.shift()! : answers[0])) };
  let clock = 0;
  jest.spyOn(Date, "now").mockImplementation(() => clock);
  const sleep = jest.fn(async (ms: number) => void (clock += ms));
  return { runner: new AppInstanceRunner(specs, apps, probe, () => timeoutMs, sleep), host, specs, apps, probe };
}

afterEach(() => jest.restoreAllMocks());

describe("AppInstanceRunner", () => {
  it("creates and starts the release, then waits for its health check", async () => {
    const { runner, host, specs, probe } = build([null, 503, 200]);

    await expect(runner.run(host, RELEASE)).resolves.toBeNull();
    expect(specs.specFor).toHaveBeenCalledWith("docker", RELEASE, { kind: "live" });
    expect(host.create).toHaveBeenCalledWith(SPEC);
    expect(host.start).toHaveBeenCalledWith("app-space-1");
    expect(probe.status).toHaveBeenCalledWith("http://app-space-1:3000/healthz");
    expect(probe.status).toHaveBeenCalledTimes(3);
  });

  it("stops waiting when the app exits, and says why with its last output", async () => {
    const { runner, host } = build([null]);
    host.status.mockResolvedValue({ state: "stopped", detail: "The app stopped with exit code 1" } satisfies AppInstanceStatus);
    host.logs.mockResolvedValue("Error: Cannot find module 'express'\n");

    await expect(runner.run(host, RELEASE)).resolves.toBe(
      "The app stopped with exit code 1. Its last output:\nError: Cannot find module 'express'",
    );
  });

  it("gives up when the health check doesn't pass in time", async () => {
    const { runner, host } = build([500], 6_000);

    await expect(runner.run(host, RELEASE)).resolves.toBe("The app answered 500 on /healthz within 6 seconds");
  });

  it("records when a live instance's credentials expire, once it's created", async () => {
    const { runner, host, apps } = build([200]);

    await runner.run(host, RELEASE);

    expect(apps.recordCredentials).toHaveBeenCalledWith("space-1", EXPIRES);
    expect(host.create.mock.invocationCallOrder[0]).toBeLessThan(apps.recordCredentials.mock.invocationCallOrder[0]);
  });

  it("doesn't record a preview's credentials as the app's", async () => {
    const { runner, host, apps } = build([200]);

    await runner.run(host, RELEASE, { kind: "preview", instance: "preview-x" });

    expect(apps.recordCredentials).not.toHaveBeenCalled();
  });

  it("restarts the live release with credentials issued before it stops", async () => {
    const { runner, host, specs, apps } = build([200]);

    await expect(runner.restart(host, RELEASE)).resolves.toBeNull();
    expect(specs.specFor.mock.invocationCallOrder[0]).toBeLessThan(host.stop.mock.invocationCallOrder[0]);
    expect(host.stop).toHaveBeenCalledWith("app-space-1", 30);
    expect(host.create).toHaveBeenCalledWith(SPEC);
    expect(apps.recordCredentials).toHaveBeenCalledWith("space-1", EXPIRES);
  });

  it("leaves the app running when new credentials can't be issued", async () => {
    const { runner, host, specs } = build([200]);
    specs.specFor.mockRejectedValue(new Error("STS is down"));

    await expect(runner.restart(host, RELEASE)).rejects.toThrow("STS is down");
    expect(host.stop).not.toHaveBeenCalled();
  });

  it("says why a restart failed once the app was stopped", async () => {
    const { runner, host } = build([200]);
    host.create.mockRejectedValue(new Error("No such image"));

    await expect(runner.restart(host, RELEASE)).resolves.toBe("No such image");
  });
});
