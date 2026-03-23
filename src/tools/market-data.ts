import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { EtoroClient } from "../client.js";
import type { PathResolver } from "../utils/path-resolver.js";
import { TtlCache } from "../utils/cache.js";
import { jsonContent, errorContent } from "../utils/formatters.js";

/** Flatten the nested eToro candle response into a plain array with null volumes defaulted to 0. */
export function flattenCandles(result: unknown): unknown[] {
  // API returns { candles: [{ candles: [...] }] } or similar nested shapes.
  // Walk into known wrappers to find the actual candle array.
  let data: unknown = result;
  if (typeof data === "object" && data !== null && "candles" in data) {
    data = (data as Record<string, unknown>).candles;
  }
  if (Array.isArray(data) && data.length > 0 && typeof data[0] === "object" && data[0] !== null && "candles" in data[0]) {
    data = (data[0] as Record<string, unknown>).candles;
  }
  const arr = Array.isArray(data) ? data : [];
  return arr.map((c: unknown) => {
    if (typeof c !== "object" || c === null) return c;
    const candle = c as Record<string, unknown>;
    return { ...candle, Volume: candle.Volume ?? 0 };
  });
}

const referenceCache = new TtlCache<unknown>();
const REFERENCE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const INSTRUMENT_TTL = 60 * 60 * 1000; // 1 hour

export async function enrichWithNames(
  client: EtoroClient,
  paths: PathResolver,
  instrumentIds: string,
  rateData: unknown,
  cache: TtlCache<unknown>,
): Promise<unknown> {
  if (!Array.isArray(rateData) || rateData.length === 0) {
    return rateData;
  }

  const ids = instrumentIds.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return rateData;
  const sortedIds = ids.sort((a, b) => Number(a) - Number(b)).join(",");
  const cacheKey = `instruments:${sortedIds}`;
  let instruments: unknown = cache.get(cacheKey);

  if (!instruments) {
    instruments = await client.get(paths.marketData("instruments"), {
      instrumentIds: sortedIds,
    });
    cache.set(cacheKey, instruments, INSTRUMENT_TTL);
  }

  const lookup = new Map<number, { InstrumentDisplayName: string; SymbolFull: string }>();
  if (Array.isArray(instruments)) {
    for (const inst of instruments) {
      if (
        typeof inst === "object" &&
        inst !== null &&
        "InstrumentID" in inst
      ) {
        const record = inst as Record<string, unknown>;
        lookup.set(
          Number(record.InstrumentID),
          {
            InstrumentDisplayName: String(record.InstrumentDisplayName ?? ""),
            SymbolFull: String(record.SymbolFull ?? ""),
          },
        );
      }
    }
  }

  return rateData.map((rate: unknown) => {
    if (typeof rate !== "object" || rate === null || !("InstrumentID" in rate)) {
      return rate;
    }
    const rateRecord = rate as Record<string, unknown>;
    const names = lookup.get(Number(rateRecord.InstrumentID));
    if (!names) {
      return rate;
    }
    return { ...rateRecord, ...names };
  });
}

export function registerMarketDataTools(
  server: McpServer,
  client: EtoroClient,
  paths: PathResolver,
): void {
  server.tool(
    "search_instruments",
    "Search for instruments by symbol (exact match via API) or by name (client-side filter). Use symbol for tickers like 'AAPL', 'BTC'. Use name for display names like 'Apple', 'Bitcoin'.",
    {
      query: z.string().describe("Search text — a ticker symbol (e.g. 'AAPL', 'BTC') or instrument name (e.g. 'Apple', 'Bitcoin')"),
      filterBy: z.enum(["symbol", "name"]).default("symbol").describe("How to search: 'symbol' filters by InternalSymbolFull (exact, server-side), 'name' filters by InstrumentDisplayName (substring, client-side)"),
      page: z.number().int().positive().default(1).describe("Page number"),
      pageSize: z.number().int().min(1).max(100).default(20).describe("Results per page"),
    },
    async ({ query, filterBy, page, pageSize }) => {
      try {
        if (filterBy === "symbol") {
          // Server-side exact filter by symbol
          const result = await client.get(paths.marketData("search"), {
            fields: "InternalSymbolFull,SymbolFull,InstrumentDisplayName,InstrumentTypeID,ExchangeID,InstrumentID",
            InternalSymbolFull: query.toUpperCase(),
            pageNumber: page,
            pageSize,
          });
          return jsonContent(result);
        }

        // Client-side name filtering: fetch a larger page and filter locally
        const fetchSize = Math.min(pageSize * 5, 100);
        const result = await client.get<Record<string, unknown>>(paths.marketData("search"), {
          fields: "InternalSymbolFull,SymbolFull,InstrumentDisplayName,InstrumentTypeID,ExchangeID,InstrumentID",
          pageNumber: page,
          pageSize: fetchSize,
        });

        const items = (result.items ?? result.Items) as Array<Record<string, unknown>> | undefined;
        if (!items) return jsonContent(result);

        const lowerQuery = query.toLowerCase();
        const filtered = items.filter((item) => {
          const displayName = String(item.InstrumentDisplayName ?? "").toLowerCase();
          const symbolFull = String(item.SymbolFull ?? "").toLowerCase();
          const internalSymbol = String(item.InternalSymbolFull ?? "").toLowerCase();
          return displayName.includes(lowerQuery) || symbolFull.includes(lowerQuery) || internalSymbol.includes(lowerQuery);
        });

        return jsonContent({
          ...result,
          items: filtered.slice(0, pageSize),
          Items: undefined,
          totalItems: filtered.length,
          TotalItems: undefined,
        });
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
      const sortedIds = instrumentIds.split(",").map((s) => s.trim()).sort((a, b) => Number(a) - Number(b)).join(",");
      const cacheKey = `instruments:${sortedIds}`;
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
      includeNames: z.boolean().default(false).describe("Include instrument display names in response"),
    },
    async ({ instrumentIds, type, includeNames }) => {
      try {
        const subpath = type === "closing_price"
          ? "instruments/history/closing-price"
          : "instruments/rates";
        const result = await client.get(paths.marketData(subpath), {
          instrumentIds,
        });

        if (includeNames) {
          try {
            const enriched = await enrichWithNames(client, paths, instrumentIds, result, referenceCache);
            return jsonContent(enriched);
          } catch (enrichError) {
            console.error("enrichWithNames failed:", enrichError instanceof Error ? enrichError.message : String(enrichError));
            return jsonContent(result);
          }
        }

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
        const result = await client.get<unknown>(
          paths.marketData(`instruments/${instrumentId}/history/candles/${direction}/${interval}/${count}`),
        );
        const candles = flattenCandles(result);
        return jsonContent(candles);
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
