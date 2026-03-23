import { describe, it, expect } from "vitest";
import { createTestClient, skipIfNoCredentials } from "./setup.js";

const skip = skipIfNoCredentials();
const ctx = skip ? null : createTestClient()!;

describe.skipIf(skip)("Integration: Market Data", () => {
  it("should search for instruments by text", async () => {
    const result = await ctx!.client.get<Record<string, unknown>>(
      ctx!.paths.marketData("search"),
      {
        fields: "InstrumentDisplayName,InstrumentID,SymbolFull",
        searchText: "Apple",
        pageSize: 5,
        pageNumber: 1,
      },
    );

    expect(result).toBeDefined();
    // API returns lowercase "items" and "totalItems"
    expect(result.items ?? result.Items).toBeDefined();
  });

  it("should get instrument metadata by ID", async () => {
    const result = await ctx!.client.get(
      ctx!.paths.marketData("instruments"),
      { instrumentIds: "1" },
    );

    expect(result).toBeDefined();
  });

  it("should get current rates for instruments", async () => {
    const result = await ctx!.client.get(
      ctx!.paths.marketData("instruments/rates"),
      { instrumentIds: "1" },
    );

    expect(result).toBeDefined();
  });

  it("should get candle data for an instrument", async () => {
    const result = await ctx!.client.get(
      ctx!.paths.marketData("instruments/1/history/candles/desc/OneDay/10"),
    );

    expect(result).toBeDefined();
  });

  it("should get instrument types reference data", async () => {
    const result = await ctx!.client.get(
      ctx!.paths.marketData("instrument-types"),
    );

    expect(result).toBeDefined();
  });

  it("should get exchanges reference data", async () => {
    const result = await ctx!.client.get(
      ctx!.paths.marketData("exchanges"),
    );

    expect(result).toBeDefined();
  });

  it("should get stock industries reference data", async () => {
    const result = await ctx!.client.get(
      ctx!.paths.marketData("stocks-industries"),
    );

    expect(result).toBeDefined();
  });
});
