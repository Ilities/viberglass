import { EventEmitter } from "events";
import type { Server, Socket } from "net";
import { refuseAppNetworks } from "../../../api/refuseAppNetworks";

function connect(server: EventEmitter, remoteAddress: string): { destroy: jest.Mock } {
  const socket = { remoteAddress, destroy: jest.fn() };
  server.emit("connection", socket as unknown as Socket);
  return socket;
}

describe("refuseAppNetworks", () => {
  it("drops connections apps open to the backend on Docker, and no others", () => {
    const server = refuseAppNetworks(new EventEmitter() as unknown as Server, {});

    expect(connect(server, "::ffff:10.250.0.3").destroy).toHaveBeenCalled();
    expect(connect(server, "172.18.0.5").destroy).not.toHaveBeenCalled();
  });

  it("follows APPS_NETWORK_POOL", () => {
    const server = refuseAppNetworks(new EventEmitter() as unknown as Server, { APPS_NETWORK_POOL: "10.99.0.0/16" });

    expect(connect(server, "10.99.1.2").destroy).toHaveBeenCalled();
    expect(connect(server, "10.250.0.3").destroy).not.toHaveBeenCalled();
  });

  it("leaves other targets alone, where a VPC may use the same range", () => {
    const server = refuseAppNetworks(new EventEmitter() as unknown as Server, { KUBERNETES_WORKER_NAMESPACE: "viberglass" });

    expect(connect(server, "10.250.0.3").destroy).not.toHaveBeenCalled();
  });
});
