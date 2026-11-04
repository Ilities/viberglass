import type { AppInstanceStatus } from "@viberglass/types";
import { AppInstanceRunner } from "../../../../services/apps/AppInstanceRunner";
import { appRelease, fakeAppHost } from "../../../helpers/fakeAppHost";

const RELEASE = appRelease("r1");
const SPEC = { instance: "app-space-1", projectId: "space-1", image: "runtime", env: { PORT: "3000" } };

function build(answers: Array<number | null>, timeoutMs = 10_000) {
  const host = fakeAppHost();
  const specs = { specFor: jest.fn(async () => SPEC) };
  const probe = { status: jest.fn(async () => (answers.length > 1 ? answers.shift()! : answers[0])) };
  let clock = 0;
  jest.spyOn(Date, "now").mockImplementation(() => clock);
  const sleep = jest.fn(async (ms: number) => void (clock += ms));
  return { runner: new AppInstanceRunner(specs, probe, () => timeoutMs, sleep), host, specs, probe };
}

afterEach(() => jest.restoreAllMocks());

describe("AppInstanceRunner", () => {
  it("creates and starts the release, then waits for its health check", async () => {
    const { runner, host, specs, probe } = build([null, 503, 200]);

    await expect(runner.run(host, RELEASE)).resolves.toBeNull();
    expect(specs.specFor).toHaveBeenCalledWith("docker", RELEASE, undefined);
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
});
