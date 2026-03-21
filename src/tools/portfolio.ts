import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { EtoroClient } from "../client.js";
import type { PathResolver } from "../utils/path-resolver.js";
import { jsonContent, errorContent } from "../utils/formatters.js";

export function registerPortfolioTools(
  server: McpServer,
  client: EtoroClient,
  paths: PathResolver,
): void {
  server.tool(
    "get_portfolio",
    "Get portfolio data: positions, P&L summary, or specific order status",
    {
      view: z.enum(["positions", "pnl", "order"]).describe("View type: 'positions' for full portfolio, 'pnl' for profit/loss summary, 'order' for specific order status"),
      orderId: z.number().int().positive().optional().describe("Order ID (required when view is 'order')"),
    },
    async ({ view, orderId }) => {
      try {
        let path: string;
        switch (view) {
          case "positions":
            path = paths.portfolio();
            break;
          case "pnl":
            path = paths.pnl();
            break;
          case "order":
            if (orderId === undefined) {
              return errorContent("orderId is required when view is 'order'");
            }
            path = paths.orderInfo(orderId);
            break;
        }
        const result = await client.get(path);
        return jsonContent(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return errorContent(`Failed to get portfolio: ${message}`);
      }
    },
  );

  server.tool(
    "get_trade_history",
    "Get closed trade history starting from a minimum date",
    {
      minDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Minimum date in YYYY-MM-DD format"),
      page: z.number().int().positive().optional().describe("Page number"),
      pageSize: z.number().int().min(1).max(100).optional().describe("Results per page"),
    },
    async ({ minDate, page, pageSize }) => {
      try {
        const params: Record<string, string | number | undefined> = { minDate };
        if (page !== undefined) params.page = page;
        if (pageSize !== undefined) params.pageSize = pageSize;

        const result = await client.get(paths.tradeHistory(), params);
        return jsonContent(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return errorContent(`Failed to get trade history: ${message}`);
      }
    },
  );
}
