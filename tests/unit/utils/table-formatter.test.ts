import { describe, it, expect } from "vitest";
import { formatTable } from "../../../src/utils/table-formatter.js";

describe("formatTable", () => {
  it("should format an array of objects as an ASCII table", () => {
    const data = [
      { Name: "Apple", Symbol: "AAPL", Price: 150.5 },
      { Name: "Microsoft", Symbol: "MSFT", Price: 300.0 },
    ];
    const result = formatTable(data);
    expect(result).toContain("Name");
    expect(result).toContain("Symbol");
    expect(result).toContain("Price");
    expect(result).toContain("Apple");
    expect(result).toContain("AAPL");
    expect(result).toContain("150.5");
    expect(result).toContain("Microsoft");
  });

  it("should return null for empty arrays", () => {
    expect(formatTable([])).toBeNull();
  });

  it("should return null for non-array input", () => {
    expect(formatTable({ key: "value" })).toBeNull();
    expect(formatTable("string")).toBeNull();
    expect(formatTable(null)).toBeNull();
  });

  it("should return null for arrays of primitives", () => {
    expect(formatTable([1, 2, 3])).toBeNull();
  });

  it("should handle null/undefined cell values with dash", () => {
    const data = [
      { Name: "Test", Value: null },
    ];
    const result = formatTable(data);
    expect(result).toContain("—");
  });

  it("should truncate long values at 40 chars", () => {
    const data = [
      { Name: "A".repeat(60) },
    ];
    const result = formatTable(data);
    expect(result).toBeDefined();
    // The cell value should be truncated
    const lines = result!.split("\n");
    const dataLine = lines[2]; // header, separator, first data line
    expect(dataLine!.length).toBeLessThan(65);
  });
});
