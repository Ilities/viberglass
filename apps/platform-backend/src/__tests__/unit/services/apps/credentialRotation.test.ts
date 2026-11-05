import { credentialsDue, rotationSchedule } from "../../../../services/apps/credentialRotation";

const HOUR_MS = 60 * 60 * 1000;
const NOON = new Date("2026-11-05T12:00:00Z");
const THREE_AM = new Date("2026-11-05T03:30:00Z");
const after = (from: Date, hours: number) => new Date(from.getTime() + hours * HOUR_MS);

describe("credentialsDue", () => {
  it("restarts week-long credentials in the restart hour in their last two days", () => {
    const weekly = rotationSchedule({});

    expect(credentialsDue(after(THREE_AM, 47), THREE_AM, weekly)).toBe(true);
    expect(credentialsDue(after(THREE_AM, 49), THREE_AM, weekly)).toBe(false);
    expect(credentialsDue(after(NOON, 47), NOON, weekly)).toBe(false);
    expect(credentialsDue(after(NOON, 11), NOON, weekly)).toBe(true);
  });

  it("restarts 12-hour credentials once a third is left, and only once in the restart hour", () => {
    const twelveHours = rotationSchedule({ APPS_DATA_CREDENTIAL_SECONDS: String(12 * 60 * 60) });

    expect(credentialsDue(after(NOON, 3.9), NOON, twelveHours)).toBe(true);
    expect(credentialsDue(after(NOON, 5), NOON, twelveHours)).toBe(false);
    expect(credentialsDue(after(THREE_AM, 5), THREE_AM, twelveHours)).toBe(true);
    expect(credentialsDue(after(THREE_AM, 12), THREE_AM, twelveHours)).toBe(false);
  });

  it("restarts at once when the credentials already expired", () => {
    expect(credentialsDue(after(NOON, -1), NOON, rotationSchedule({}))).toBe(true);
  });

  it("never restarts an app whose host supplies its credentials", () => {
    expect(credentialsDue(null, NOON, rotationSchedule({}))).toBe(false);
  });

  it("takes the restart hour from APPS_RESTART_HOUR", () => {
    expect(rotationSchedule({ APPS_RESTART_HOUR: "22" }).restartHour).toBe(22);
    expect(rotationSchedule({ APPS_RESTART_HOUR: "25" }).restartHour).toBe(3);
  });
});
