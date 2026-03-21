import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { EtoroClient } from "../client.js";
import type { PathResolver } from "../utils/path-resolver.js";
import { jsonContent, errorContent } from "../utils/formatters.js";

export function registerIdentityTools(
  server: McpServer,
  client: EtoroClient,
  paths: PathResolver,
): void {
  server.tool(
    "get_identity",
    "Get the authenticated user's identity and account information",
    {},
    async () => {
      try {
        const result = await client.get(paths.identity());
        return jsonContent(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return errorContent(`Failed to get identity: ${message}`);
      }
    },
  );
}
