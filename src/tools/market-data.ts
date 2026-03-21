import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { EtoroClient } from "../client.js";
import type { PathResolver } from "../utils/path-resolver.js";
import { TtlCache } from "../utils/cache.js";
import { jsonContent, errorContent } from "../utils/formatters.js";

const referenceCache = new TtlCache<unknown>();
const REFERENCE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const INSTRUMENT_TTL = 60 * 60 * 1000; // 1 hour

export function registerMarketDataTools(
  server: McpServer,
  client: EtoroClient,
  paths: PathResolver,
): void {
  server.tool(
    "search_instruments",
    "Search for instruments (stocks, crypto, ETFs, etc.) by text query or symbol",
    {
      query: z.string().describe("Search text (name, symbol, or ISIN)"),
      page: z.number().int().positive().default(1).describe("Page number"),
      pageSize: z.number().int().min(1).max(100).default(20).describe("Results per page"),
    },
    async ({ query, page, pageSize }) => {
      try {
        const result = await client.get(paths.marketData("search"), {
          fields: "InternalSymbolFull,SymbolFull,InstrumentDisplayName,InstrumentTypeID,ExchangeID,InstrumentID",
          searchText: query,
          pageNumber: page,
          pageSize,
        });
        return jsonContent(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return errorContent(`Failed to search instruments: ${message}`);
      }
    },
  );

  server.tool(
    "get_instruments",
    "Get detailed metadata for specific instruments by their IDs",
    {
      instrumentIds: z.string().describe("Comma-separated instrument IDs (e.g. '1,2,3')"),
    },
    async ({ instrumentIds }) => {
      const cacheKey = `instruments:${instrumentIds}`;
      const cached = referenceCache.get(cacheKey);
      if (cached) return jsonContent(cached);

      try {
        const result = await client.get(paths.marketData("instruments"), {
          instrumentIds,
        });
        referenceCache.set(cacheKey, result, INSTRUMENT_TTL);
        return jsonContent(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return errorContent(`Failed to get instruments: ${message}`);
      }
    },
  );

  server.tool(
    "get_rates",
    "Get current market rates/prices for instruments. Use 'closing_price' type for historical closing prices.",
    {
      instrumentIds: z.string().describe("Comma-separated instrument IDs (max 100)"),
      type: z.enum(["current", "closing_price"]).default("current").describe("Rate type: 'current' for live rates, 'closing_price' for historical closing prices"),
    },
    async ({ instrumentIds, type }) => {
      try {
        const subpath = type === "closing_price"
          ? "instruments/history/closing-price"
          : "instruments/rates";
        const result = await client.get(paths.marketData(subpath), {
          instrumentIds,
        });
        return jsonContent(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return errorContent(`Failed to get rates: ${message}`);
      }
    },
  );

  server.tool(
    "get_candles",
    "Get historical candle (OHLC) data for an instrument",
    {
      instrumentId: z.number().int().positive().describe("Instrument ID"),
      interval: z.enum([
        "OneMinute", "FiveMinutes", "TenMinutes", "FifteenMinutes",
        "ThirtyMinutes", "OneHour", "FourHours", "OneDay", "OneWeek",
      ]).describe("Candle interval"),
      count: z.number().int().min(1).max(1000).default(100).describe("Number of candles (max 1000)"),
      direction: z.enum(["asc", "desc"]).default("desc").describe("Sort order"),
    },
    async ({ instrumentId, interval, count, direction }) => {
      try {
        const result = await client.get(
          paths.marketData(`instruments/${instrumentId}/history/candles/${direction}/${interval}/${count}`),
        );
        return jsonContent(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return errorContent(`Failed to get candles: ${message}`);
      }
    },
  );

  server.tool(
    "get_reference_data",
    "Get reference data: instrument types, exchanges, or stock industries (cached 24h)",
    {
      type: z.enum(["instrument_types", "exchanges", "stocks_industries"]).describe("Type of reference data"),
      ids: z.string().optional().describe("Optional comma-separated IDs to filter"),
    },
    async ({ type, ids }) => {
      const cacheKey = `ref:${type}:${ids ?? "all"}`;
      const cached = referenceCache.get(cacheKey);
      if (cached) return jsonContent(cached);

      try {
        const subpathMap = {
          instrument_types: "instrument-types",
          exchanges: "exchanges",
          stocks_industries: "stocks-industries",
        } as const;

        const paramMap = {
          instrument_types: "instrumentTypeIds",
          exchanges: "exchangeIds",
          stocks_industries: "stocksIndustryIds",
        } as const;

        const params: Record<string, string | undefined> = {};
        if (ids) {
          params[paramMap[type]] = ids;
        }

        const result = await client.get(paths.marketData(subpathMap[type]), params);
        referenceCache.set(cacheKey, result, REFERENCE_TTL);
        return jsonContent(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return errorContent(`Failed to get reference data: ${message}`);
      }
    },
  );
}
