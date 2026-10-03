import type { Logger } from "winston";
import type { AcpHttpMcpServer } from "@viberglass/agent-core";
import type { WorkerMcpServer } from "@viberglass/types";

/**
 * The runner's MCP servers as the harness takes them, with secret header
 * values read from the credentials the worker fetched. A server whose secret
 * is missing is left out rather than offered without its credentials.
 */
export function httpMcpServersOf(
  servers: WorkerMcpServer[],
  credentials: Record<string, string | undefined>,
  logger: Logger,
): AcpHttpMcpServer[] {
  return servers.flatMap((server): AcpHttpMcpServer[] => {
    const headers: AcpHttpMcpServer["headers"] = [];
    for (const header of server.headers) {
      if (!("envVar" in header)) {
        headers.push(header);
        continue;
      }
      const secret = credentials[header.envVar];
      if (!secret) {
        logger.warn("Leaving out an MCP server whose header secret is missing", { server: server.name, header: header.name });
        return [];
      }
      headers.push({ name: header.name, value: `${header.prefix ?? ""}${secret}` });
    }
    return [{ type: "http", name: server.name, url: server.url, headers }];
  });
}
