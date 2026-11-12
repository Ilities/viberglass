import type { AppInstanceStatus } from "@viberglass/types";
import { AppInstanceRunner } from "../../../../services/apps/AppInstanceRunner";
import { appRelease, fakeAppHost } from "../../../helpers/fakeAppHost";

const RELEASE = appRelease("r1");
const SPEC = { instance: "app-space-1", projectId: "space-1", image: "runtime", env: { PORT: "3000" } };
const EXPIRES = new Date("2026-11-12T12:00:00Z");

function build(answers: Array<number | null>, healthMs = 10_000, startMs = 60_000) {
  const host = fakeAppHost();
  const specs = { specFor: jest.fn(async () => ({ spec: SPEC, credentialsExpireAt: EXPIRES })) };
  const apps = { recordCredentials: jest.fn(async () => undefined) };
  const probe = { status: jest.fn(async () => (answers.length > 1 ? answers.shift()! : answers[0])) };
  let clock = 0;
  jest.spyOn(Date, "now").mockImplementation(() => clock);
  const sleep = jest.fn(async (ms: number) => void (clock += ms));
  return { runner: new AppInstanceRunner(specs, apps, probe, () => ({ startMs, healthMs }), sleep), host, specs, apps, probe, now: () => clock };
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

    await expect(runner.run(host, RELEASE)).resolves.toBe("The app answered 500 on /healthz within 6 seconds of starting");
  });

  it("starts the health check's time once the host runs the app, not while it waits for volumes", async () => {
    const { runner, host, now } = build([null], 6_000, 60_000);
    let polls = 0;
    host.status.mockImplementation(async () => (++polls <= 20 ? { state: "starting" } : { state: "running" }));

    await expect(runner.run(host, RELEASE)).resolves.toBe("The app didn't answer on /healthz within 6 seconds of starting");
    expect(now()).toBeGreaterThanOrEqual(40_000 + 6_000);
  });

  it("answers as soon as the app is healthy, even while the host still says it's starting", async () => {
    const { runner, host } = build([null, 200]);
    host.status.mockResolvedValue({ state: "starting" });

    await expect(runner.run(host, RELEASE)).resolves.toBeNull();
  });

  it("gives up with what the host says when it doesn't get the app running in time", async () => {
    const { runner, host, probe } = build([null], 6_000, 30_000);
    host.status.mockResolvedValue({ state: "starting", detail: "0/3 nodes are available: 3 Insufficient memory." });

    await expect(runner.run(host, RELEASE)).resolves.toBe(
      "The host didn't get the app running within 30 seconds: 0/3 nodes are available: 3 Insufficient memory.",
    );
    expect(probe.status.mock.calls.length).toBeGreaterThan(3);
    expect(host.logs).not.toHaveBeenCalled();
  });

  it("keeps the health check's time running when a started app restarts", async () => {
    const { runner, host } = build([null], 6_000, 600_000);
    let polls = 0;
    host.status.mockImplementation(async () => (++polls === 1 ? { state: "running" } : { state: "starting" }));

    await expect(runner.run(host, RELEASE)).resolves.toBe("The app didn't answer on /healthz within 6 seconds of starting");
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
