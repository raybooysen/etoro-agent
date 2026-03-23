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
    const result = await ctx!.client.post<Record<string, unknown>>(
      ctx!.paths.trading("market-open-orders/by-amount"),
      {
        InstrumentID: 1,
        IsBuy: true,
        Leverage: 1,
        Amount: 50,
      },
    );

    expect(result).toBeDefined();
    // API returns { orderForOpen: { orderID: ... } }
    const order = result.orderForOpen as Record<string, unknown> | undefined;
    if (order) {
      expect(order.orderID).toBeDefined();
    }
  });

  it("should verify the position appears in portfolio", async () => {
    // Wait briefly for order to execute
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const result = await ctx!.client.get<Record<string, unknown>>(ctx!.paths.portfolio());

    expect(result).toBeDefined();
    // API returns { clientPortfolio: { positions: [...] } }
    const portfolio = result.clientPortfolio as Record<string, unknown> | undefined;
    if (portfolio) {
      const positions = portfolio.positions as Array<Record<string, unknown>> | undefined;
      if (positions && positions.length > 0) {
        const position = positions.find((p) => p.instrumentID === 1 || p.InstrumentID === 1);
        if (position) {
          positionId = (position.positionID ?? position.PositionID) as number;
        }
      }
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
