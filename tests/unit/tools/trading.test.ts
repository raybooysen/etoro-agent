import { describe, it, expect, vi } from "vitest";
import { lookupInstrumentId, registerTradingTools } from "../../../src/tools/trading.js";
import { createMockServer, createMockClient, demoPaths } from "../../helpers/mock-mcp.js";

describe("lookupInstrumentId", () => {
  it("finds instrumentID from { positions: [...] } (camelCase)", () => {
    const portfolio = {
      positions: [
        { positionID: 123, instrumentID: 18 },
        { positionID: 456, instrumentID: 42 },
      ],
    };
    expect(lookupInstrumentId(portfolio, 123)).toBe(18);
    expect(lookupInstrumentId(portfolio, 456)).toBe(42);
  });

  it("finds InstrumentID from { Positions: [...] } (PascalCase)", () => {
    const portfolio = {
      Positions: [
        { PositionID: 123, InstrumentID: 18 },
      ],
    };
    expect(lookupInstrumentId(portfolio, 123)).toBe(18);
  });

  it("works with a flat array of positions", () => {
    const portfolio = [
      { positionID: 123, instrumentID: 18 },
    ];
    expect(lookupInstrumentId(portfolio, 123)).toBe(18);
  });

  it("returns undefined when position not found", () => {
    const portfolio = {
      positions: [
        { positionID: 123, instrumentID: 18 },
      ],
    };
    expect(lookupInstrumentId(portfolio, 999)).toBeUndefined();
  });

  it("finds instrumentID from actual API shape { clientPortfolio: { positions: [...] } }", () => {
    const portfolio = {
      clientPortfolio: {
        positions: [
          { positionID: 3471852411, instrumentID: 18 },
          { positionID: 3471853059, instrumentID: 1001 },
          { positionID: 3471853067, instrumentID: 100000 },
        ],
        credit: 71103.83,
        unrealizedPnL: -769.85,
      },
    };
    expect(lookupInstrumentId(portfolio, 3471852411)).toBe(18);
    expect(lookupInstrumentId(portfolio, 3471853059)).toBe(1001);
    expect(lookupInstrumentId(portfolio, 3471853067)).toBe(100000);
  });

  it("finds InstrumentID from PascalCase { ClientPortfolio: { Positions: [...] } }", () => {
    const portfolio = {
      ClientPortfolio: {
        Positions: [
          { PositionID: 123, InstrumentID: 18 },
        ],
      },
    };
    expect(lookupInstrumentId(portfolio, 123)).toBe(18);
  });

  it("returns undefined for null/undefined/non-object input", () => {
    expect(lookupInstrumentId(null, 123)).toBeUndefined();
    expect(lookupInstrumentId(undefined, 123)).toBeUndefined();
    expect(lookupInstrumentId("string", 123)).toBeUndefined();
  });

  it("returns undefined when positions array has no instrumentID", () => {
    const portfolio = {
      positions: [
        { positionID: 123 },
      ],
    };
    expect(lookupInstrumentId(portfolio, 123)).toBeUndefined();
  });
});

function setupTrading() {
  const client = createMockClient({
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  });
  const { tool, handlers } = createMockServer();
  registerTradingTools(tool as any, client, demoPaths);
  return { client, handlers };
}

describe("open_order handler", () => {
  it("opens a by_amount order", async () => {
    const { client, handlers } = setupTrading();
    await handlers.get("open_order")!({
      order_type: "by_amount", InstrumentID: 1, IsBuy: true, Leverage: 1, Amount: 100,
    });
    expect(client.post).toHaveBeenCalledWith(demoPaths.trading("market-open-orders/by-amount"), {
      InstrumentID: 1, IsBuy: true, Leverage: 1, Amount: 100,
    });
  });

  it("rejects by_amount without Amount", async () => {
    const { client, handlers } = setupTrading();
    const result = await handlers.get("open_order")!({
      order_type: "by_amount", InstrumentID: 1, IsBuy: true, Leverage: 1,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Amount is required for order_type 'by_amount'");
    expect(client.post).not.toHaveBeenCalled();
  });

  it("opens a by_units order", async () => {
    const { client, handlers } = setupTrading();
    await handlers.get("open_order")!({
      order_type: "by_units", InstrumentID: 1, IsBuy: false, Leverage: 2, AmountInUnits: 10,
    });
    expect(client.post).toHaveBeenCalledWith(demoPaths.trading("market-open-orders/by-units"), {
      InstrumentID: 1, IsBuy: false, Leverage: 2, AmountInUnits: 10,
    });
  });

  it("rejects by_units without AmountInUnits", async () => {
    const { handlers } = setupTrading();
    const result = await handlers.get("open_order")!({
      order_type: "by_units", InstrumentID: 1, IsBuy: false, Leverage: 2,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("AmountInUnits is required for order_type 'by_units'");
  });

  it("returns errorContent when the client throws", async () => {
    const client = createMockClient({ post: vi.fn().mockRejectedValue(new Error("insufficient funds")) });
    const { tool, handlers } = createMockServer();
    registerTradingTools(tool as any, client, demoPaths);

    const result = await handlers.get("open_order")!({
      order_type: "by_amount", InstrumentID: 1, IsBuy: true, Leverage: 1, Amount: 100,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to open order: insufficient funds");
  });
});

describe("close_position handler", () => {
  it("closes using an explicitly provided InstrumentID", async () => {
    const { client, handlers } = setupTrading();
    await handlers.get("close_position")!({ positionId: 100, InstrumentID: 18 });
    expect(client.get).not.toHaveBeenCalled();
    expect(client.post).toHaveBeenCalledWith(demoPaths.trading("market-close-orders/positions/100"), { InstrumentID: 18 });
  });

  it("auto-looks-up InstrumentID from the portfolio when not provided", async () => {
    const client = createMockClient({
      get: vi.fn().mockResolvedValue({ positions: [{ positionID: 100, instrumentID: 18 }] }),
      post: vi.fn().mockResolvedValue({}),
    });
    const { tool, handlers } = createMockServer();
    registerTradingTools(tool as any, client, demoPaths);

    await handlers.get("close_position")!({ positionId: 100 });

    expect(client.get).toHaveBeenCalledWith(demoPaths.portfolio());
    expect(client.post).toHaveBeenCalledWith(demoPaths.trading("market-close-orders/positions/100"), { InstrumentID: 18 });
  });

  it("errors when auto-lookup can't find the position", async () => {
    const client = createMockClient({ get: vi.fn().mockResolvedValue({ positions: [] }) });
    const { tool, handlers } = createMockServer();
    registerTradingTools(tool as any, client, demoPaths);

    const result = await handlers.get("close_position")!({ positionId: 999 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Could not find position 999 in portfolio. Provide InstrumentID explicitly.");
  });

  it("includes UnitsToDeduct for a partial close", async () => {
    const { client, handlers } = setupTrading();
    await handlers.get("close_position")!({ positionId: 100, InstrumentID: 18, UnitsToDeduct: 5 });
    expect(client.post).toHaveBeenCalledWith(demoPaths.trading("market-close-orders/positions/100"), {
      InstrumentID: 18, UnitsToDeduct: 5,
    });
  });

  it("returns errorContent when the client throws", async () => {
    const client = createMockClient({ post: vi.fn().mockRejectedValue(new Error("position already closed")) });
    const { tool, handlers } = createMockServer();
    registerTradingTools(tool as any, client, demoPaths);

    const result = await handlers.get("close_position")!({ positionId: 100, InstrumentID: 18 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to close position: position already closed");
  });
});

describe("manage_order handler", () => {
  it("cancel_open_order", async () => {
    const { client, handlers } = setupTrading();
    await handlers.get("manage_order")!({ action: "cancel_open_order", orderId: 5 });
    expect(client.delete).toHaveBeenCalledWith(demoPaths.trading("market-open-orders/5"));
  });

  it("rejects cancel_open_order without orderId", async () => {
    const { handlers } = setupTrading();
    const result = await handlers.get("manage_order")!({ action: "cancel_open_order" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("orderId is required for cancel_open_order");
  });

  it("cancel_close_order", async () => {
    const { client, handlers } = setupTrading();
    await handlers.get("manage_order")!({ action: "cancel_close_order", orderId: 6 });
    expect(client.delete).toHaveBeenCalledWith(demoPaths.trading("market-close-orders/6"));
  });

  it("rejects cancel_close_order without orderId", async () => {
    const { handlers } = setupTrading();
    const result = await handlers.get("manage_order")!({ action: "cancel_close_order" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("orderId is required for cancel_close_order");
  });

  it("place_limit_order with all optional fields", async () => {
    const { client, handlers } = setupTrading();
    await handlers.get("manage_order")!({
      action: "place_limit_order", InstrumentID: 1, IsBuy: true, Leverage: 1, Rate: 150,
      Amount: 100, StopLossRate: 140, TakeProfitRate: 160, IsTslEnabled: true,
      IsNoStopLoss: false, IsNoTakeProfit: false,
    });
    expect(client.post).toHaveBeenCalledWith(demoPaths.trading("limit-orders"), {
      InstrumentID: 1, IsBuy: true, Leverage: 1, Rate: 150,
      Amount: 100, StopLossRate: 140, TakeProfitRate: 160, IsTslEnabled: true,
      IsNoStopLoss: false, IsNoTakeProfit: false,
    });
  });

  it("place_limit_order with only the required fields", async () => {
    const { client, handlers } = setupTrading();
    await handlers.get("manage_order")!({ action: "place_limit_order", InstrumentID: 1, IsBuy: true, Leverage: 1, Rate: 150 });
    expect(client.post).toHaveBeenCalledWith(demoPaths.trading("limit-orders"), {
      InstrumentID: 1, IsBuy: true, Leverage: 1, Rate: 150,
    });
  });

  it("rejects place_limit_order missing required fields", async () => {
    const { handlers } = setupTrading();
    const result = await handlers.get("manage_order")!({ action: "place_limit_order", InstrumentID: 1, IsBuy: true });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("InstrumentID, IsBuy, Leverage, and Rate are required for place_limit_order");
  });

  it("cancel_limit_order", async () => {
    const { client, handlers } = setupTrading();
    await handlers.get("manage_order")!({ action: "cancel_limit_order", orderId: 7 });
    expect(client.delete).toHaveBeenCalledWith(demoPaths.trading("limit-orders/7"));
  });

  it("rejects cancel_limit_order without orderId", async () => {
    const { handlers } = setupTrading();
    const result = await handlers.get("manage_order")!({ action: "cancel_limit_order" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("orderId is required for cancel_limit_order");
  });

  it("returns errorContent when the client throws", async () => {
    const client = createMockClient({ delete: vi.fn().mockRejectedValue(new Error("order not found")) });
    const { tool, handlers } = createMockServer();
    registerTradingTools(tool as any, client, demoPaths);

    const result = await handlers.get("manage_order")!({ action: "cancel_open_order", orderId: 5 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to manage order: order not found");
  });
});
