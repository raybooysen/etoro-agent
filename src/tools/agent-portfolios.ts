import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { EtoroClient } from "../client.js";
import type { PathResolver } from "../utils/path-resolver.js";
import { jsonContent, errorContent } from "../utils/formatters.js";

export function registerAgentPortfolioTools(
  server: McpServer,
  client: EtoroClient,
  paths: PathResolver,
): void {
  server.tool(
    "manage_agent_portfolios",
    "Manage agent portfolios: list, create, delete, and manage user tokens",
    {
      action: z.enum([
        "list", "create", "delete",
        "create_token", "revoke_token", "update_token",
      ]).describe("Action to perform"),
      agentPortfolioId: z.string().optional().describe("Agent portfolio UUID (required for delete/token operations)"),
      userTokenId: z.string().optional().describe("User token UUID (required for revoke/update token)"),
      name: z.string().optional().describe("Portfolio name (required for create)"),
      description: z.string().optional().describe("Portfolio description (for create)"),
      tokenSettings: z.string().optional().describe("JSON settings for create/update token"),
    },
    async (args) => {
      try {
        switch (args.action) {
          case "list": {
            const result = await client.get(paths.agentPortfolios());
            return jsonContent(result);
          }
          case "create": {
            if (!args.name) return errorContent("name is required for create");
            const body: Record<string, unknown> = { name: args.name };
            if (args.description) body.description = args.description;
            const result = await client.post(paths.agentPortfolios(), body);
            return jsonContent(result);
          }
          case "delete": {
            if (!args.agentPortfolioId) return errorContent("agentPortfolioId is required");
            const result = await client.delete(paths.agentPortfolios(args.agentPortfolioId));
            return jsonContent(result);
          }
          case "create_token": {
            if (!args.agentPortfolioId) return errorContent("agentPortfolioId is required");
            const body = args.tokenSettings ? JSON.parse(args.tokenSettings) : {};
            const result = await client.post(
              paths.agentPortfolios(`${args.agentPortfolioId}/user-tokens`),
              body,
            );
            return jsonContent(result);
          }
          case "revoke_token": {
            if (!args.agentPortfolioId || !args.userTokenId) {
              return errorContent("agentPortfolioId and userTokenId are required");
            }
            const result = await client.delete(
              paths.agentPortfolios(`${args.agentPortfolioId}/user-tokens/${args.userTokenId}`),
            );
            return jsonContent(result);
          }
          case "update_token": {
            if (!args.agentPortfolioId || !args.userTokenId) {
              return errorContent("agentPortfolioId and userTokenId are required");
            }
            const body = args.tokenSettings ? JSON.parse(args.tokenSettings) : {};
            const result = await client.patch(
              paths.agentPortfolios(`${args.agentPortfolioId}/user-tokens/${args.userTokenId}`),
              body,
            );
            return jsonContent(result);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return errorContent(`Failed to manage agent portfolio: ${message}`);
      }
    },
  );
}
