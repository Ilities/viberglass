import type { TaskParticipant } from "@viberglass/types";
import { resolveAddressee } from "../../../../services/questions/resolveAddressee";

const person = (userId: string, name: string, role: TaskParticipant["role"]): TaskParticipant => ({
  userId,
  name,
  email: `${name.split(" ")[0].toLowerCase()}@example.com`,
  role,
  addedAt: "2026-10-01T00:00:00.000Z",
});

const PEOPLE = [
  person("u-maria", "Maria Lopez", "requester"),
  person("u-tomi", "Tomi Virtanen", "owner"),
  person("u-ana", "Ana Silva", "reviewer"),
  person("u-ana2", "Ana Berg", "watcher"),
];

describe("resolveAddressee", () => {
  it("finds the person in the role the agent named", () => {
    expect(resolveAddressee("requester", PEOPLE, null)).toEqual({ userId: "u-maria", name: "Maria Lopez", role: "requester" });
    expect(resolveAddressee("The owner", PEOPLE, null)?.userId).toBe("u-tomi");
    expect(resolveAddressee("reviewers", PEOPLE, null)?.userId).toBe("u-ana");
  });

  it("finds a person by full name, email or a first name only they have", () => {
    expect(resolveAddressee("@maria lopez", PEOPLE, null)).toEqual({ userId: "u-maria", name: "Maria Lopez", role: "person" });
    expect(resolveAddressee("tomi@example.com", PEOPLE, null)?.userId).toBe("u-tomi");
    expect(resolveAddressee("Maria", PEOPLE, null)?.userId).toBe("u-maria");
  });

  it("asks the owner when the name fits more than one person, or nobody", () => {
    expect(resolveAddressee("Ana", PEOPLE, null)).toEqual({ userId: "u-tomi", name: "Tomi Virtanen", role: "driver" });
    expect(resolveAddressee("the PM", PEOPLE, null)?.userId).toBe("u-tomi");
    expect(resolveAddressee(null, PEOPLE, null)?.userId).toBe("u-tomi");
  });

  it("falls back to the requester, then whoever opened the session", () => {
    const noOwner = PEOPLE.filter((p) => p.role !== "owner");
    expect(resolveAddressee("owner", noOwner, null)?.userId).toBe("u-maria");
    expect(resolveAddressee(null, [], { id: "u-dev", name: "Dev" })).toEqual({ userId: "u-dev", name: "Dev", role: "driver" });
    expect(resolveAddressee(null, [], null)).toBeNull();
  });
});
