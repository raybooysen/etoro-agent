import { describe, it, expect } from "vitest";
import { flattenPnl } from "../../../src/tools/portfolio.js";

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
