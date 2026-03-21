import { describe, it, expect } from "vitest";
import { createTestClient, skipIfNoCredentials } from "./setup.js";

const skip = skipIfNoCredentials();
const ctx = skip ? null : createTestClient()!;

describe.skipIf(skip)("Integration: Discovery & Feeds", () => {
  it("should get curated lists", async () => {
    const result = await ctx!.client.get(
      ctx!.paths.discovery("curated-lists"),
    );

    expect(result).toBeDefined();
  });

  it("should get market recommendations", async () => {
    const result = await ctx!.client.get(
      ctx!.paths.discovery("market-recommendations/5"),
    );

    expect(result).toBeDefined();
  });

  it("should get instrument feed", async () => {
    const result = await ctx!.client.get(
      ctx!.paths.feeds("instrument/1"),
      { take: 5, offset: 0 },
    );

    expect(result).toBeDefined();
  });
});
