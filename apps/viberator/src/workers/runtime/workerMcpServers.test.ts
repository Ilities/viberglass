import { createLogger, transports } from "winston";
import { httpMcpServersOf } from "./workerMcpServers";

const logger = createLogger({ transports: [new transports.Console({ silent: true })] });

describe("httpMcpServersOf", () => {
  it("fills secret headers from the worker's credentials, after their prefix", () => {
    const servers = httpMcpServersOf(
      [
        {
          name: "linear",
          url: "https://mcp.linear.app/mcp",
          headers: [
            { name: "Authorization", envVar: "VIBERGLASS_MCP_0_0", prefix: "Bearer " },
            { name: "X-Team", value: "web" },
          ],
        },
      ],
      { VIBERGLASS_MCP_0_0: "tok" },
      logger,
    );
    expect(servers).toEqual([
      {
        type: "http",
        name: "linear",
        url: "https://mcp.linear.app/mcp",
        headers: [
          { name: "Authorization", value: "Bearer tok" },
          { name: "X-Team", value: "web" },
        ],
      },
    ]);
  });

  it("leaves out a server whose secret didn't arrive", () => {
    const servers = httpMcpServersOf(
      [{ name: "a", url: "https://a", headers: [{ name: "Authorization", envVar: "VIBERGLASS_MCP_0_0" }] }],
      {},
      logger,
    );
    expect(servers).toEqual([]);
  });
});
