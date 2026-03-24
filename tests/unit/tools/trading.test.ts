import { describe, it, expect } from "vitest";
import { lookupInstrumentId } from "../../../src/tools/trading.js";

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
