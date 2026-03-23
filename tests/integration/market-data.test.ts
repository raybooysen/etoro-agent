import { describe, it, expect } from "vitest";
import { createTestClient, skipIfNoCredentials } from "./setup.js";

const skip = skipIfNoCredentials();
const ctx = skip ? null : createTestClient()!;

describe.skipIf(skip)("Integration: Market Data", () => {
  it("should search for instruments by symbol (server-side filter)", async () => {
    const result = await ctx!.client.get<Record<string, unknown>>(
      ctx!.paths.marketData("search"),
      {
        fields: "InstrumentDisplayName,InstrumentID,SymbolFull,InternalSymbolFull",
        InternalSymbolFull: "AAPL",
        pageSize: 5,
        pageNumber: 1,
      },
    );

    expect(result).toBeDefined();
    const items = (result.items ?? result.Items) as Array<Record<string, unknown>> | undefined;
    expect(items).toBeDefined();
    expect(items!.length).toBeGreaterThan(0);

    // The result should contain Apple
    const hasApple = items!.some((item) => {
      const internalSymbol = String(item.InternalSymbolFull ?? "").toUpperCase();
      return internalSymbol.includes("AAPL");
    });
    expect(hasApple).toBe(true);
  });

  it("should return different results for different symbol queries", async () => {
    const appleResult = await ctx!.client.get<Record<string, unknown>>(
      ctx!.paths.marketData("search"),
      {
        fields: "InstrumentID,InternalSymbolFull",
        InternalSymbolFull: "AAPL",
        pageSize: 1,
        pageNumber: 1,
      },
    );
    const btcResult = await ctx!.client.get<Record<string, unknown>>(
      ctx!.paths.marketData("search"),
      {
        fields: "InstrumentID,InternalSymbolFull",
        InternalSymbolFull: "BTC",
        pageSize: 1,
        pageNumber: 1,
      },
    );

    const appleItems = (appleResult.items ?? appleResult.Items) as Array<Record<string, unknown>>;
    const btcItems = (btcResult.items ?? btcResult.Items) as Array<Record<string, unknown>>;

    expect(appleItems.length).toBeGreaterThan(0);
    expect(btcItems.length).toBeGreaterThan(0);
    expect(appleItems[0].InstrumentID).not.toBe(btcItems[0].InstrumentID);
  });

  it("should return empty or no results for nonsensical symbol", async () => {
    const result = await ctx!.client.get<Record<string, unknown>>(
      ctx!.paths.marketData("search"),
      {
        fields: "InstrumentID",
        InternalSymbolFull: "XYZZZNOTASYMBOL99999",
        pageSize: 5,
        pageNumber: 1,
      },
    );

    const items = (result.items ?? result.Items) as Array<unknown> | undefined;
    const totalItems = (result.totalItems ?? result.TotalItems) as number | undefined;
    const isEmpty = (items !== undefined && items.length === 0) || totalItems === 0;
    expect(isEmpty).toBe(true);
  });

  it("should get instrument metadata by ID", async () => {
    const result = await ctx!.client.get<unknown>(
      ctx!.paths.marketData("instruments"),
      { instrumentIds: "1" },
    );

    expect(result).toBeDefined();
    // Response should be an array with InstrumentID field
    expect(Array.isArray(result)).toBe(true);
    const arr = result as Array<Record<string, unknown>>;
    expect(arr.length).toBeGreaterThan(0);
    expect(arr[0]).toHaveProperty("InstrumentID");
  });

  it("should get current rates for instruments", async () => {
    const result = await ctx!.client.get<unknown>(
      ctx!.paths.marketData("instruments/rates"),
      { instrumentIds: "1" },
    );

    expect(result).toBeDefined();
    // Response should be an array with numeric rate fields
    expect(Array.isArray(result)).toBe(true);
    const arr = result as Array<Record<string, unknown>>;
    expect(arr.length).toBeGreaterThan(0);
    const rate = arr[0];
    expect(rate).toHaveProperty("InstrumentID");
    // At least one of Ask/Bid/LastExecution should be a number
    const hasNumericRate =
      typeof rate.Ask === "number" ||
      typeof rate.Bid === "number" ||
      typeof rate.LastExecution === "number";
    expect(hasNumericRate).toBe(true);
  });

  it("should get candle data for an instrument", async () => {
    const result = await ctx!.client.get<unknown>(
      ctx!.paths.marketData("instruments/1/history/candles/desc/OneDay/10"),
    );

    expect(result).toBeDefined();
    // Response should contain candle objects with OHLC fields
    expect(Array.isArray(result)).toBe(true);
    const arr = result as Array<Record<string, unknown>>;
    expect(arr.length).toBeGreaterThan(0);
    const candle = arr[0];
    // Candles should have Open, High, Low, Close fields (or similar casing)
    const hasOHLC =
      ("Open" in candle || "open" in candle) &&
      ("High" in candle || "high" in candle) &&
      ("Low" in candle || "low" in candle) &&
      ("Close" in candle || "close" in candle);
    expect(hasOHLC).toBe(true);
  });

  it("should get instrument types reference data", async () => {
    const result = await ctx!.client.get<unknown>(
      ctx!.paths.marketData("instrument-types"),
    );

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it("should get exchanges reference data", async () => {
    const result = await ctx!.client.get<unknown>(
      ctx!.paths.marketData("exchanges"),
    );

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it("should get stock industries reference data", async () => {
    const result = await ctx!.client.get<unknown>(
      ctx!.paths.marketData("stocks-industries"),
    );

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });
});
