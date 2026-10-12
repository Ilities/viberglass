import { intervalToMilliseconds } from "@viberglass/types";
import { ClawIntervalGate } from "../../../../services/claw/ClawIntervalGate";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe("intervalToMilliseconds", () => {
  it.each([
    ["5m", 5 * 60_000],
    ["7m", 7 * 60_000],
    ["5h", 5 * HOUR],
    ["2d", 2 * DAY],
    ["3w", 21 * DAY],
  ])("reads %s", (expression, expected) => {
    expect(intervalToMilliseconds(expression)).toBe(expected);
  });

  it("rejects zero and malformed intervals", () => {
    expect(intervalToMilliseconds("0m")).toBeNull();
    expect(intervalToMilliseconds("2x")).toBeNull();
    expect(intervalToMilliseconds("")).toBeNull();
  });
});

describe("ClawIntervalGate", () => {
  const start = new Date("2026-10-01T10:00:00Z");
  const at = (ms: number) => new Date(start.getTime() + ms);

  it("runs every 2 days rather than every 2 hours", () => {
    const gate = new ClawIntervalGate(2 * DAY, start);

    expect(gate.takeDueRun(at(2 * HOUR))).toBe(false);
    expect(gate.takeDueRun(at(DAY))).toBe(false);
    expect(gate.takeDueRun(at(2 * DAY))).toBe(true);
    expect(gate.takeDueRun(at(3 * DAY))).toBe(false);
    expect(gate.takeDueRun(at(4 * DAY))).toBe(true);
  });

  it("measures the next interval from the run it just allowed", () => {
    const gate = new ClawIntervalGate(HOUR, start);

    expect(gate.takeDueRun(at(HOUR + 30_000))).toBe(true);
    expect(gate.takeDueRun(at(2 * HOUR))).toBe(false);
    expect(gate.takeDueRun(at(2 * HOUR + 30_000))).toBe(true);
  });

  it("runs once to catch up after a long gap, not once per missed interval", () => {
    const gate = new ClawIntervalGate(HOUR, start);

    expect(gate.takeDueRun(at(10 * HOUR))).toBe(true);
    expect(gate.takeDueRun(at(10 * HOUR + 60_000))).toBe(false);
  });
});
