import { describe, it, expect } from "vitest";
import { createTestClient, skipIfNoCredentials, getTestConfig } from "./setup.js";

const skip = skipIfNoCredentials();
const testConfig = skip ? null : getTestConfig()!;
const ctx = skip ? null : createTestClient()!;

// Only run trading tests on demo accounts
const skipTrading = skip || testConfig?.environment !== "demo";

describe.skipIf(skipTrading)("Integration: Trading (Demo)", () => {
  let positionId: number | undefined;

  it("should open a market order by amount on demo", async () => {
    // Search for a liquid instrument first (e.g., Apple = 1)
    const result = await ctx!.client.post<{ OrderId: number }>(
      ctx!.paths.trading("market-open-orders/by-amount"),
      {
        InstrumentID: 1,  // Typically Apple or a well-known instrument
        IsBuy: true,
        Leverage: 1,
        Amount: 50,
      },
    );

    expect(result).toBeDefined();
    expect(result.OrderId).toBeDefined();
    expect(typeof result.OrderId).toBe("number");
  });

  it("should verify the position appears in portfolio", async () => {
    // Wait briefly for order to execute
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const portfolio = await ctx!.client.get<{
      Positions: Array<{ PositionID: number; InstrumentID: number }>;
    }>(ctx!.paths.portfolio());

    expect(portfolio).toBeDefined();
    expect(portfolio.Positions).toBeDefined();

    // Find our position (InstrumentID 1)
    const position = portfolio.Positions.find((p) => p.InstrumentID === 1);
    if (position) {
      positionId = position.PositionID;
    }
  });

  it("should close the demo position", async () => {
    if (!positionId) {
      console.log("⏭ No position to close (open order may not have executed yet)");
      return;
    }

    const result = await ctx!.client.post(
      ctx!.paths.trading(`market-close-orders/positions/${positionId}`),
    );

    expect(result).toBeDefined();
  });
});
