import { describe, it, expect } from "vitest";
import { flattenPnl, flattenPositions } from "../../../src/tools/portfolio.js";

describe("flattenPnl", () => {
  it("should flatten nested clientPortfolio response", () => {
    const nested = {
      clientPortfolio: {
        credit: 10000,
        unrealizedPnL: 500,
        invested: 5000,
      },
    };
    const result = flattenPnl(nested) as Record<string, unknown>;
    // TotalEquity = credit + unrealizedPnL = 10000 + 500
    expect(result.TotalEquity).toBe(10500);
    expect(result.TotalPnL).toBe(500);
    expect(result.UnrealizedPnL).toBe(500);
    expect(result.Cash).toBe(10000);
    expect(result.credit).toBe(10000);
    expect(result.invested).toBe(5000);
  });

  it("should handle PascalCase API response", () => {
    const nested = {
      ClientPortfolio: {
        Credit: 8000,
        UnrealizedPnL: -200,
      },
    };
    const result = flattenPnl(nested) as Record<string, unknown>;
    // TotalEquity = Credit + UnrealizedPnL = 8000 + (-200)
    expect(result.TotalEquity).toBe(7800);
    expect(result.TotalPnL).toBe(-200);
    expect(result.Cash).toBe(8000);
  });

  it("should compute TotalEquity correctly with negative unrealizedPnL (bug regression)", () => {
    const nested = {
      clientPortfolio: {
        credit: 71103.83,
        unrealizedPnL: -769.85,
      },
    };
    const result = flattenPnl(nested) as Record<string, unknown>;
    // The reported bug: TotalEquity was set to credit (71103.83) instead of credit + unrealizedPnL
    expect(result.TotalEquity).toBeCloseTo(70333.98, 2);
    expect(result.Cash).toBe(71103.83);
    expect(result.UnrealizedPnL).toBe(-769.85);
  });

  it("should return raw result when no clientPortfolio key exists", () => {
    const flat = { TotalPnL: 100, TotalEquity: 5000 };
    expect(flattenPnl(flat)).toEqual(flat);
  });

  it("should handle null/undefined input", () => {
    expect(flattenPnl(null)).toBeNull();
    expect(flattenPnl(undefined)).toBeUndefined();
  });
});

describe("flattenPositions", () => {
  it("should extract and flatten positions with nested unrealizedPnL", () => {
    const raw = {
      clientPortfolio: {
        positions: [
          {
            positionID: 123,
            instrumentID: 1,
            openRate: 150.0,
            amount: 1000,
            leverage: 1,
            isBuy: true,
            unrealizedPnL: {
              closeRate: 160.0,
              pnL: 66.67,
            },
          },
        ],
      },
    };
    const result = flattenPositions(raw) as Array<Record<string, unknown>>;
    expect(result).toHaveLength(1);
    expect(result[0].positionID).toBe(123);
    expect(result[0].currentRate).toBe(160.0);
    expect(result[0].pnL).toBe(66.67);
    expect(result[0].pnLPercent).toBeCloseTo(6.67, 2);
    // Nested object should be removed
    expect(result[0].unrealizedPnL).toBeUndefined();
  });

  it("should handle PascalCase nested fields", () => {
    const raw = {
      ClientPortfolio: {
        Positions: [
          {
            positionID: 456,
            instrumentID: 2,
            amount: 500,
            UnrealizedPnL: {
              CloseRate: 50.0,
              PnL: -25.0,
            },
          },
        ],
      },
    };
    const result = flattenPositions(raw) as Array<Record<string, unknown>>;
    expect(result).toHaveLength(1);
    expect(result[0].currentRate).toBe(50.0);
    expect(result[0].pnL).toBe(-25.0);
    expect(result[0].pnLPercent).toBe(-5.0);
    expect(result[0].UnrealizedPnL).toBeUndefined();
  });

  it("should leave positions without unrealizedPnL unchanged", () => {
    const raw = {
      clientPortfolio: {
        positions: [
          {
            positionID: 789,
            instrumentID: 3,
            openRate: 100.0,
            amount: 200,
          },
        ],
      },
    };
    const result = flattenPositions(raw) as Array<Record<string, unknown>>;
    expect(result).toHaveLength(1);
    expect(result[0].positionID).toBe(789);
    expect(result[0].currentRate).toBeUndefined();
    expect(result[0].pnL).toBeUndefined();
  });

  it("should return empty array for null/undefined input", () => {
    expect(flattenPositions(null)).toEqual([]);
    expect(flattenPositions(undefined)).toEqual([]);
  });

  it("should return empty array when no positions exist", () => {
    expect(flattenPositions({ clientPortfolio: {} })).toEqual([]);
    expect(flattenPositions({ clientPortfolio: { positions: [] } })).toEqual([]);
  });

  it("should handle multiple positions", () => {
    const raw = {
      clientPortfolio: {
        positions: [
          {
            positionID: 1,
            instrumentID: 10,
            amount: 1000,
            unrealizedPnL: { closeRate: 110, pnL: 100 },
          },
          {
            positionID: 2,
            instrumentID: 20,
            amount: 500,
            unrealizedPnL: { closeRate: 45, pnL: -50 },
          },
          {
            positionID: 3,
            instrumentID: 30,
            amount: 200,
          },
        ],
      },
    };
    const result = flattenPositions(raw) as Array<Record<string, unknown>>;
    expect(result).toHaveLength(3);
    expect(result[0].pnLPercent).toBe(10);
    expect(result[1].pnLPercent).toBe(-10);
    expect(result[2].pnLPercent).toBeUndefined();
  });
});
