import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { EtoroClient } from "../client.js";
import type { PathResolver } from "../utils/path-resolver.js";
import { jsonContent, errorContent } from "../utils/formatters.js";

export function registerDiscoveryTools(
  server: McpServer,
  client: EtoroClient,
  paths: PathResolver,
): void {
  server.tool(
    "get_discovery",
    "Get curated investment lists or personalized market recommendations",
    {
      type: z.enum(["curated_lists", "recommendations"]).describe("'curated_lists' for curated lists, 'recommendations' for personalized picks"),
      count: z.number().int().min(1).max(100).default(10).describe("Number of recommendations (only for recommendations)"),
    },
    async ({ type, count }) => {
      try {
        if (type === "curated_lists") {
          const result = await client.get(paths.discovery("curated-lists"));
          return jsonContent(result ?? []);
        }
        const result = await client.get(paths.discovery(`market-recommendations/${count}`));
        if (result === undefined || result === null) {
          return jsonContent({ recommendations: [], message: "No recommendations available for this account." });
        }
        return jsonContent(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return errorContent(`Failed to get discovery data: ${message}`);
      }
    },
  );
}
