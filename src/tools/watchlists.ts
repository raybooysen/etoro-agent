import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { EtoroClient } from "../client.js";
import type { PathResolver } from "../utils/path-resolver.js";
import { jsonContent, errorContent } from "../utils/formatters.js";

export function registerWatchlistTools(
  server: McpServer,
  client: EtoroClient,
  paths: PathResolver,
): void {
  server.tool(
    "manage_watchlists",
    "Manage watchlists: list, get, create, delete, rename, reorder, add/remove items, get public watchlists",
    {
      action: z.enum([
        "list", "get", "create", "delete", "rename", "rank",
        "add_items", "remove_items", "update_items",
        "set_default", "get_default", "create_default_items",
        "create_as_default", "get_public", "get_public_single",
      ]).describe("Watchlist action to perform"),
      watchlistId: z.string().optional().describe("Watchlist ID (required for get/delete/rename/rank/items/set_default)"),
      name: z.string().optional().describe("Watchlist name (for create/rename/create_as_default)"),
      rank: z.number().int().optional().describe("New rank/position (for rank action)"),
      instrumentIds: z.string().optional().describe("Comma-separated instrument IDs (for add/remove items)"),
      items: z.string().optional().describe("JSON array of items (for update_items/create_default_items)"),
      userId: z.string().optional().describe("User ID (for get_public/get_public_single)"),
      page: z.number().int().positive().optional().describe("Page number"),
      pageSize: z.number().int().min(1).max(100).optional().describe("Items per page"),
    },
    async (args) => {
      try {
        switch (args.action) {
          case "list": {
            const result = await client.get(paths.watchlists());
            return jsonContent(result);
          }
          case "get": {
            if (!args.watchlistId) return errorContent("watchlistId is required");
            const result = await client.get(paths.watchlists(args.watchlistId));
            return jsonContent(result);
          }
          case "create": {
            if (!args.name) return errorContent("name is required for create");
            const result = await client.post(paths.watchlists(), { name: args.name });
            return jsonContent(result);
          }
          case "delete": {
            if (!args.watchlistId) return errorContent("watchlistId is required");
            const result = await client.delete(paths.watchlists(args.watchlistId));
            return jsonContent(result);
          }
          case "rename": {
            if (!args.watchlistId || !args.name) return errorContent("watchlistId and name are required for rename");
            const result = await client.put(
              paths.watchlists(`${args.watchlistId}/rename`),
              undefined,
            );
            return jsonContent(result);
          }
          case "rank": {
            if (!args.watchlistId || args.rank === undefined) return errorContent("watchlistId and rank are required");
            const result = await client.put(
              paths.watchlists(`${args.watchlistId}/rank`),
              { rank: args.rank },
            );
            return jsonContent(result);
          }
          case "add_items": {
            if (!args.watchlistId || !args.instrumentIds) return errorContent("watchlistId and instrumentIds are required");
            const ids = args.instrumentIds.split(",").map(Number);
            const result = await client.post(paths.watchlists(`${args.watchlistId}/items`), ids);
            return jsonContent(result);
          }
          case "remove_items": {
            if (!args.watchlistId || !args.instrumentIds) return errorContent("watchlistId and instrumentIds are required");
            const ids = args.instrumentIds.split(",").map(Number);
            const result = await client.delete(paths.watchlists(`${args.watchlistId}/items`), ids);
            return jsonContent(result);
          }
          case "update_items": {
            if (!args.watchlistId || !args.items) return errorContent("watchlistId and items JSON are required");
            const parsed = JSON.parse(args.items);
            const result = await client.put(paths.watchlists(`${args.watchlistId}/items`), parsed);
            return jsonContent(result);
          }
          case "set_default": {
            if (!args.watchlistId) return errorContent("watchlistId is required");
            const result = await client.put(paths.watchlists(`setUserSelectedUserDefault/${args.watchlistId}`));
            return jsonContent(result);
          }
          case "get_default": {
            const params: Record<string, number | undefined> = {
              itemsLimit: args.pageSize,
            };
            const result = await client.get(paths.watchlists("default-watchlists/items"), params);
            return jsonContent(result);
          }
          case "create_default_items": {
            if (!args.items) return errorContent("items JSON is required");
            const parsed = JSON.parse(args.items);
            const result = await client.post(paths.watchlists("default-watchlist/selected-items"), parsed);
            return jsonContent(result);
          }
          case "create_as_default": {
            if (!args.name) return errorContent("name is required");
            const result = await client.post(
              paths.watchlists("newasdefault-watchlist"),
              undefined,
            );
            return jsonContent(result);
          }
          case "get_public": {
            if (!args.userId) return errorContent("userId is required");
            const params: Record<string, number | undefined> = {
              itemsPerPageForSingle: args.pageSize,
            };
            const result = await client.get(paths.watchlists(`public/${args.userId}`), params);
            return jsonContent(result);
          }
          case "get_public_single": {
            if (!args.userId || !args.watchlistId) return errorContent("userId and watchlistId are required");
            const params: Record<string, number | undefined> = {
              pageNumber: args.page,
              itemsPerPage: args.pageSize,
            };
            const result = await client.get(
              paths.watchlists(`public/${args.userId}/${args.watchlistId}`),
              params,
            );
            return jsonContent(result);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return errorContent(`Failed to manage watchlist: ${message}`);
      }
    },
  );
}
