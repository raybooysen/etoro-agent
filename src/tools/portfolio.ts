import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { EtoroClient } from "../client.js";
import type { PathResolver } from "../utils/path-resolver.js";
import { TtlCache } from "../utils/cache.js";
import { enrichWithNames } from "./market-data.js";
import { jsonContent, errorContent } from "../utils/formatters.js";

const instrumentCache = new TtlCache<unknown>();

/** Extract positions from raw API response and flatten nested unrealizedPnL fields. */
export function flattenPositions(result: unknown): unknown[] {
  if (typeof result !== "object" || result === null) return [];

  const obj = result as Record<string, unknown>;
  const portfolio = (obj.clientPortfolio ?? obj.ClientPortfolio) as Record<string, unknown> | undefined;
  const positions = (portfolio?.positions ?? portfolio?.Positions ?? obj.positions ?? obj.Positions) as unknown[] | undefined;
  if (!Array.isArray(positions)) return [];

  return positions.map((pos: unknown) => {
    if (typeof pos !== "object" || pos === null) return pos;
    const record = pos as Record<string, unknown>;
    const pnlObj = (record.unrealizedPnL ?? record.UnrealizedPnL) as Record<string, unknown> | undefined;

    if (typeof pnlObj !== "object" || pnlObj === null) return record;

    const closeRate = pnlObj.closeRate ?? pnlObj.CloseRate;
    const pnl = pnlObj.pnL ?? pnlObj.PnL ?? pnlObj.pnl;
    const amount = Number(record.amount ?? record.Amount ?? 0);
    const pnlNum = Number(pnl ?? 0);

    const flattened: Record<string, unknown> = { ...record };
    // Remove the nested object
    delete flattened.unrealizedPnL;
    delete flattened.UnrealizedPnL;

    if (closeRate !== undefined) flattened.currentRate = closeRate;
    if (pnl !== undefined) flattened.pnL = pnlNum;
    if (pnl !== undefined && amount !== 0) {
      flattened.pnLPercent = Math.round((pnlNum / amount) * 100 * 100) / 100;
    }

    return flattened;
  });
}

/** Flatten nested P&L response into a simple summary object. */
export function flattenPnl(result: unknown): unknown {
  if (typeof result !== "object" || result === null) return result;
  const obj = result as Record<string, unknown>;

  // API returns { clientPortfolio: { credit, unrealizedPnL, ... }, ... }
  // Flatten to top-level with consistent field names
  const portfolio = (obj.clientPortfolio ?? obj.ClientPortfolio) as Record<string, unknown> | undefined;
  if (!portfolio) return result;

  const flattened: Record<string, unknown> = {
    TotalEquity: (Number(portfolio.credit ?? portfolio.Credit ?? 0)) + (Number(portfolio.unrealizedPnL ?? portfolio.UnrealizedPnL ?? 0)),
    TotalPnL: portfolio.unrealizedPnL ?? portfolio.UnrealizedPnL ?? portfolio.totalPnL ?? portfolio.TotalPnL,
    UnrealizedPnL: portfolio.unrealizedPnL ?? portfolio.UnrealizedPnL,
    Cash: portfolio.credit ?? portfolio.Credit,
    ...portfolio,
  };

  // Also flatten positions within the pnl response
  const positions = (portfolio.positions ?? portfolio.Positions) as unknown[] | undefined;
  if (Array.isArray(positions) && positions.length > 0) {
    flattened.positions = flattenPositions(result);
  }

  return flattened;
}

/** Extract unique instrument IDs from a positions array. */
export function extractPositionIds(positions: unknown[]): string[] {
  const ids = positions
    .map((p) => {
      if (typeof p !== "object" || p === null) return undefined;
      const rec = p as Record<string, unknown>;
      return rec.instrumentID ?? rec.InstrumentID;
    })
    .filter((id) => id !== undefined)
    .map(String);
  return [...new Set(ids)];
}

/** Extract trade items from the trade history API response, handling various wrapper shapes. */
export function extractTradeHistoryItems(result: unknown): { items: unknown[]; wrapper: string | null } {
  if (Array.isArray(result)) return { items: result, wrapper: null };
  if (typeof result !== "object" || result === null) return { items: [], wrapper: null };

  const obj = result as Record<string, unknown>;
  // Check known wrapper keys
  for (const key of ["publicHistoryPositions", "PublicHistoryPositions", "items", "Items", "closedPositions", "ClosedPositions"]) {
    if (Array.isArray(obj[key])) {
      return { items: obj[key] as unknown[], wrapper: key };
    }
  }
  return { items: [], wrapper: null };
}

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
        if (view === "pnl") {
          const pnl = flattenPnl(result) as Record<string, unknown>;
          // Enrich positions within pnl response
          if (Array.isArray(pnl.positions) && pnl.positions.length > 0) {
            const ids = extractPositionIds(pnl.positions);
            if (ids.length > 0) {
              try {
                pnl.positions = (await enrichWithNames(client, paths, ids.join(","), pnl.positions, instrumentCache)) as unknown[];
              } catch {
                // Best-effort
              }
            }
          }
          return jsonContent(pnl);
        }
        if (view === "positions") {
          let positions = flattenPositions(result);
          const ids = extractPositionIds(positions);
          if (ids.length > 0) {
            try {
              positions = (await enrichWithNames(client, paths, ids.join(","), positions, instrumentCache)) as unknown[];
            } catch {
              // Enrichment is best-effort; return positions without names
            }
          }
          return jsonContent(positions);
        }
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
      includeNames: z.boolean().default(false).describe("Include instrument display names in response (opt-in, costs extra API calls)"),
    },
    async ({ minDate, page, pageSize, includeNames }) => {
      try {
        const params: Record<string, string | number | undefined> = { minDate };
        if (page !== undefined) params.page = page;
        if (pageSize !== undefined) params.pageSize = pageSize;

        const result = await client.get(paths.tradeHistory(), params);

        if (includeNames) {
          const { items, wrapper } = extractTradeHistoryItems(result);
          if (items.length > 0) {
            const ids = items
              .map((item) => {
                if (typeof item !== "object" || item === null) return undefined;
                const rec = item as Record<string, unknown>;
                return rec.instrumentID ?? rec.InstrumentID;
              })
              .filter((id) => id !== undefined)
              .map(String);
            if (ids.length > 0) {
              try {
                const uniqueIds = [...new Set(ids)].join(",");
                const enriched = (await enrichWithNames(client, paths, uniqueIds, items, instrumentCache)) as unknown[];
                if (wrapper && typeof result === "object" && result !== null) {
                  return jsonContent({ ...(result as Record<string, unknown>), [wrapper]: enriched });
                }
                return jsonContent(enriched);
              } catch {
                // Enrichment is best-effort
              }
            }
          }
        }

        return jsonContent(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return errorContent(`Failed to get trade history: ${message}`);
      }
    },
  );
}
