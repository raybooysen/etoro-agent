import { describe, it, expect } from "vitest";
import {
  OpenOrderByAmountSchema,
  OpenOrderByUnitsSchema,
  ClosePositionSchema,
  LimitOrderSchema,
  CreatePostSchema,
  CreateCommentSchema,
  CreateWatchlistSchema,
  CreateAgentPortfolioSchema,
} from "../../../src/types/api.js";

describe("OpenOrderByAmountSchema", () => {
  const valid = { InstrumentID: 1, IsBuy: true, Leverage: 1, Amount: 100 };

  it("accepts valid order", () => {
    expect(OpenOrderByAmountSchema.parse(valid)).toEqual(valid);
  });

  it("accepts optional fields", () => {
    const full = { ...valid, StopLossRate: 50, TakeProfitRate: 200, IsTslEnabled: true, IsNoStopLoss: false, IsNoTakeProfit: false };
    expect(OpenOrderByAmountSchema.parse(full)).toEqual(full);
  });

  it("rejects negative Amount", () => {
    expect(() => OpenOrderByAmountSchema.parse({ ...valid, Amount: -1 })).toThrow();
  });

  it("rejects non-integer InstrumentID", () => {
    expect(() => OpenOrderByAmountSchema.parse({ ...valid, InstrumentID: 1.5 })).toThrow();
  });
});

describe("OpenOrderByUnitsSchema", () => {
  const valid = { InstrumentID: 1, IsBuy: false, Leverage: 2, AmountInUnits: 5 };

  it("accepts valid order", () => {
    expect(OpenOrderByUnitsSchema.parse(valid)).toEqual(valid);
  });

  it("rejects zero AmountInUnits", () => {
    expect(() => OpenOrderByUnitsSchema.parse({ ...valid, AmountInUnits: 0 })).toThrow();
  });
});

describe("ClosePositionSchema", () => {
  it("accepts empty object", () => {
    expect(ClosePositionSchema.parse({})).toEqual({});
  });

  it("accepts InstrumentID only", () => {
    expect(ClosePositionSchema.parse({ InstrumentID: 42 })).toEqual({ InstrumentID: 42 });
  });

  it("accepts UnitsToDeduct only", () => {
    expect(ClosePositionSchema.parse({ UnitsToDeduct: 10 })).toEqual({ UnitsToDeduct: 10 });
  });
});

describe("LimitOrderSchema", () => {
  const valid = { InstrumentID: 1, IsBuy: true, Leverage: 1, Rate: 150 };

  it("accepts valid limit order", () => {
    expect(LimitOrderSchema.parse(valid)).toEqual(valid);
  });

  it("accepts with Amount", () => {
    expect(LimitOrderSchema.parse({ ...valid, Amount: 100 })).toEqual({ ...valid, Amount: 100 });
  });

  it("accepts with AmountInUnits", () => {
    expect(LimitOrderSchema.parse({ ...valid, AmountInUnits: 5 })).toEqual({ ...valid, AmountInUnits: 5 });
  });

  it("rejects missing Rate", () => {
    expect(() => LimitOrderSchema.parse({ InstrumentID: 1, IsBuy: true, Leverage: 1 })).toThrow();
  });
});

describe("CreatePostSchema", () => {
  it("accepts valid post", () => {
    const post = { message: "Hello", owner: 1 };
    expect(CreatePostSchema.parse(post)).toEqual(post);
  });

  it("accepts optional tags and mentions", () => {
    const post = { message: "Hi", owner: 1, tags: ["stock"], mentions: [2, 3] };
    expect(CreatePostSchema.parse(post)).toEqual(post);
  });

  it("rejects empty message", () => {
    expect(() => CreatePostSchema.parse({ message: "", owner: 1 })).toThrow();
  });
});

describe("CreateCommentSchema", () => {
  it("accepts valid comment", () => {
    expect(CreateCommentSchema.parse({ message: "Nice" })).toEqual({ message: "Nice" });
  });

  it("rejects empty message", () => {
    expect(() => CreateCommentSchema.parse({ message: "" })).toThrow();
  });
});

describe("CreateWatchlistSchema", () => {
  it("accepts valid watchlist", () => {
    expect(CreateWatchlistSchema.parse({ name: "My List" })).toEqual({ name: "My List" });
  });

  it("rejects empty name", () => {
    expect(() => CreateWatchlistSchema.parse({ name: "" })).toThrow();
  });
});

describe("CreateAgentPortfolioSchema", () => {
  it("accepts name only", () => {
    expect(CreateAgentPortfolioSchema.parse({ name: "Portfolio" })).toEqual({ name: "Portfolio" });
  });

  it("accepts name and description", () => {
    const data = { name: "P", description: "desc" };
    expect(CreateAgentPortfolioSchema.parse(data)).toEqual(data);
  });

  it("rejects empty name", () => {
    expect(() => CreateAgentPortfolioSchema.parse({ name: "" })).toThrow();
  });
});
