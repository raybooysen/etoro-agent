import { describe, it, expect } from "vitest";
import { createTestClient, skipIfNoCredentials } from "./setup.js";

const skip = skipIfNoCredentials();
const ctx = skip ? null : createTestClient()!;

describe.skipIf(skip)("Integration: Market Data", () => {
  it("should search for instruments by symbol (server-side filter)", async () => {
    const result = await ctx!.client.get<Record<string, unknown>>(
      ctx!.paths.marketData("search"),
      {
        InternalSymbolFull: "AAPL",
        pageSize: 5,
        pageNumber: 1,
      },
    );

    expect(result).toBeDefined();
    expect(result.items).toBeDefined();
    const items = result.items as Array<Record<string, unknown>>;
    expect(items.length).toBeGreaterThan(0);
    // totalItems should be small (not 11,168 — that means filtering is broken)
    expect(result.totalItems as number).toBeLessThan(100);
  });

  it("should return different results for different symbol queries", async () => {
    const appleResult = await ctx!.client.get<Record<string, unknown>>(
      ctx!.paths.marketData("search"),
      { InternalSymbolFull: "AAPL", pageSize: 1, pageNumber: 1 },
    );
    const btcResult = await ctx!.client.get<Record<string, unknown>>(
      ctx!.paths.marketData("search"),
      { InternalSymbolFull: "BTC", pageSize: 1, pageNumber: 1 },
    );

    const appleItems = appleResult.items as Array<Record<string, unknown>>;
    const btcItems = btcResult.items as Array<Record<string, unknown>>;

    expect(appleItems.length).toBeGreaterThan(0);
    expect(btcItems.length).toBeGreaterThan(0);
    // API returns camelCase instrumentId
    expect(appleItems[0].instrumentId).not.toBe(btcItems[0].instrumentId);
  });

  it("should return empty or no results for nonsensical symbol", async () => {
    const result = await ctx!.client.get<Record<string, unknown>>(
      ctx!.paths.marketData("search"),
      {
        InternalSymbolFull: "XYZZZNOTASYMBOL99999",
        pageSize: 5,
        pageNumber: 1,
      },
    );

    const items = result.items as Array<unknown> | undefined;
    const totalItems = result.totalItems as number | undefined;
    const isEmpty = (items !== undefined && items.length === 0) || totalItems === 0;
    expect(isEmpty).toBe(true);
  });

  it("should get instrument metadata by ID", async () => {
    const result = await ctx!.client.get<Record<string, unknown>>(
      ctx!.paths.marketData("instruments"),
      { instrumentIds: "1" },
    );

    expect(result).toBeDefined();
    // API returns { instrumentDisplayDatas: [...] }
    expect(result.instrumentDisplayDatas).toBeDefined();
    const arr = result.instrumentDisplayDatas as Array<Record<string, unknown>>;
    expect(arr.length).toBeGreaterThan(0);
    expect(arr[0]).toHaveProperty("instrumentID");
    expect(arr[0]).toHaveProperty("instrumentDisplayName");
  });

  it("should get current rates for instruments", async () => {
    const result = await ctx!.client.get<Record<string, unknown>>(
      ctx!.paths.marketData("instruments/rates"),
      { instrumentIds: "1" },
    );

    expect(result).toBeDefined();
    // API returns { rates: [...] }
    expect(result.rates).toBeDefined();
    const arr = result.rates as Array<Record<string, unknown>>;
    expect(arr.length).toBeGreaterThan(0);
    const rate = arr[0];
    expect(rate).toHaveProperty("instrumentID");
    // At least one of ask/bid/lastExecution should be a number
    const hasNumericRate =
      typeof rate.ask === "number" ||
      typeof rate.bid === "number" ||
      typeof rate.lastExecution === "number";
    expect(hasNumericRate).toBe(true);
  });

  it("should get candle data for an instrument", async () => {
    const result = await ctx!.client.get<Record<string, unknown>>(
      ctx!.paths.marketData("instruments/1/history/candles/desc/OneDay/10"),
    );

    expect(result).toBeDefined();
    // API returns { candles: [{ candles: [...] }] }
    expect(result.candles).toBeDefined();
    const outer = result.candles as Array<Record<string, unknown>>;
    expect(outer.length).toBeGreaterThan(0);
    const inner = outer[0].candles as Array<Record<string, unknown>>;
    expect(inner.length).toBeGreaterThan(0);
    const candle = inner[0];
    expect(candle).toHaveProperty("open");
    expect(candle).toHaveProperty("high");
    expect(candle).toHaveProperty("low");
    expect(candle).toHaveProperty("close");
  });

  it("should get instrument types reference data", async () => {
    const result = await ctx!.client.get<Record<string, unknown>>(
      ctx!.paths.marketData("instrument-types"),
    );

    expect(result).toBeDefined();
    // API returns { instrumentTypes: [...] }
    expect(result.instrumentTypes).toBeDefined();
    const arr = result.instrumentTypes as Array<Record<string, unknown>>;
    expect(arr.length).toBeGreaterThan(0);
    expect(arr[0]).toHaveProperty("instrumentTypeID");
  });

  it("should get exchanges reference data", async () => {
    const result = await ctx!.client.get<Record<string, unknown>>(
      ctx!.paths.marketData("exchanges"),
    );

    expect(result).toBeDefined();
    // API returns { exchanges: [...] }
    expect(result.exchanges).toBeDefined();
    const arr = result.exchanges as Array<Record<string, unknown>>;
    expect(arr.length).toBeGreaterThan(0);
  });

  it("should get stock industries reference data", async () => {
    const result = await ctx!.client.get<Record<string, unknown>>(
      ctx!.paths.marketData("stocks-industries"),
    );

    expect(result).toBeDefined();
    // API returns { stocksIndustries: [...] }
    expect(result.stocksIndustries).toBeDefined();
    const arr = result.stocksIndustries as Array<Record<string, unknown>>;
    expect(arr.length).toBeGreaterThan(0);
  });
});
