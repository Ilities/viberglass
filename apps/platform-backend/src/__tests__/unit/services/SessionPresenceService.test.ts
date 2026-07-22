import {
  SessionPresenceService,
  type PresenceUser,
  type SseConnection,
} from "../../../services/agentSession/SessionPresenceService";

interface FakeConnection extends SseConnection {
  write: jest.Mock;
}

function fakeConnection(): FakeConnection {
  return { write: jest.fn().mockReturnValue(true) };
}

function eventsFor(conn: FakeConnection): Array<Record<string, unknown>> {
  return conn.write.mock.calls.map((call) => {
    const payload = call[0] as string;
    expect(payload.startsWith("data: ")).toBe(true);
    return JSON.parse(payload.slice(6).trim()) as Record<string, unknown>;
  });
}

function eventTypesFor(conn: FakeConnection): string[] {
  return eventsFor(conn).map((e) => e.eventType as string);
}

const jussi: PresenceUser = {
  userId: "user-1",
  userName: "Jussi",
  avatarUrl: null,
};

const anna: PresenceUser = {
  userId: "user-2",
  userName: "Anna",
  avatarUrl: "https://example.com/anna.png",
};

describe("SessionPresenceService", () => {
  let service: SessionPresenceService;

  beforeEach(() => {
    service = new SessionPresenceService();
  });

  it("broadcasts user_joined and presence_update when a user connects", () => {
    const conn = fakeConnection();
    service.registerConnection("session-1", conn, jussi);

    const types = eventTypesFor(conn);
    expect(types).toEqual(["user_joined", "presence_update"]);

    const update = eventsFor(conn)[1];
    expect(update.sequence).toBe(-1);
    expect(
      (update.payloadJson as { users: PresenceUser[] }).users,
    ).toEqual([jussi]);
  });

  it("broadcasts to all connections of the session when another user joins", () => {
    const connA = fakeConnection();
    const connB = fakeConnection();

    service.registerConnection("session-1", connA, jussi);
    connA.write.mockClear();

    service.registerConnection("session-1", connB, anna);

    expect(eventTypesFor(connA)).toEqual(["user_joined", "presence_update"]);
    expect(service.getPresentUsers("session-1")).toEqual(
      expect.arrayContaining([jussi, anna]),
    );
  });

  it("does not re-broadcast user_joined for a second tab of the same user", () => {
    const tab1 = fakeConnection();
    const tab2 = fakeConnection();

    service.registerConnection("session-1", tab1, jussi);
    tab1.write.mockClear();

    service.registerConnection("session-1", tab2, jussi);

    expect(eventTypesFor(tab1)).toEqual(["presence_update"]);
    expect(service.getPresentUsers("session-1")).toEqual([jussi]);
  });

  it("keeps the user present until their last connection closes", () => {
    const tab1 = fakeConnection();
    const tab2 = fakeConnection();
    const watcher = fakeConnection();

    service.registerConnection("session-1", tab1, jussi);
    service.registerConnection("session-1", tab2, jussi);
    service.registerConnection("session-1", watcher, anna);
    watcher.write.mockClear();

    service.removeConnection("session-1", tab1, jussi.userId);

    expect(eventTypesFor(watcher)).toEqual([]);
    expect(service.getPresentUsers("session-1")).toEqual(
      expect.arrayContaining([jussi, anna]),
    );

    service.removeConnection("session-1", tab2, jussi.userId);

    expect(eventTypesFor(watcher)).toEqual(["user_left", "presence_update"]);
    expect(service.getPresentUsers("session-1")).toEqual([anna]);
  });

  it("ignores repeated removal of the same connection", () => {
    const conn = fakeConnection();
    service.registerConnection("session-1", conn, jussi);

    service.removeConnection("session-1", conn, jussi.userId);
    expect(service.getPresentUsers("session-1")).toEqual([]);

    // Second removal (e.g. double close) must not throw or corrupt state
    service.removeConnection("session-1", conn, jussi.userId);
    expect(service.getPresentUsers("session-1")).toEqual([]);
  });

  it("drops dead connections on write failure and stops writing to them", () => {
    const dead = fakeConnection();
    const live = fakeConnection();

    service.registerConnection("session-1", dead, jussi);
    service.registerConnection("session-1", live, anna);

    dead.write.mockImplementation(() => {
      throw new Error("socket closed");
    });
    dead.write.mockClear();

    // Trigger a broadcast by removing jussi — dead.write throws and is dropped
    service.removeConnection("session-1", dead, jussi.userId);

    const annaOnly = fakeConnection();
    service.registerConnection("session-1", annaOnly, jussi);

    // dead received the first broadcast attempt (user_left/presence_update)
    // but must receive no further writes after being dropped
    const writesBeforeDrop = dead.write.mock.calls.length;
    service.removeConnection("session-1", live, anna.userId);
    expect(dead.write.mock.calls.length).toBe(writesBeforeDrop);
  });

  it("tracks presence independently per session", () => {
    const connA = fakeConnection();
    const connB = fakeConnection();

    service.registerConnection("session-1", connA, jussi);
    service.registerConnection("session-2", connB, anna);

    expect(service.getPresentUsers("session-1")).toEqual([jussi]);
    expect(service.getPresentUsers("session-2")).toEqual([anna]);
  });
});
