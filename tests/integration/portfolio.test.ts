import { describe, it, expect } from "vitest";
import { createTestClient, skipIfNoCredentials } from "./setup.js";

const skip = skipIfNoCredentials();
const ctx = skip ? null : createTestClient()!;

describe.skipIf(skip)("Integration: Portfolio", () => {
  it("should get demo portfolio positions", async () => {
    const result = await ctx!.client.get(ctx!.paths.portfolio());

    expect(result).toBeDefined();
  });

  it("should get demo portfolio P&L", async () => {
    const result = await ctx!.client.get(ctx!.paths.pnl());

    expect(result).toBeDefined();
  });

  it("should get trade history", async () => {
    // Use a date from 1 year ago to ensure we get some results
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const minDate = oneYearAgo.toISOString().split("T")[0];

    const result = await ctx!.client.get(ctx!.paths.tradeHistory(), {
      minDate,
      pageSize: 5,
    });

    expect(result).toBeDefined();
  });
});
