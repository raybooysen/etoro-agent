import { describe, it, expect } from "vitest";
import { createTestClient, skipIfNoCredentials } from "./setup.js";

const skip = skipIfNoCredentials();
const ctx = skip ? null : createTestClient()!;

describe.skipIf(skip)("Integration: Social", () => {
  it("should search for popular investors", async () => {
    const result = await ctx!.client.get(
      ctx!.paths.social("people/search"),
      {
        period: "CurrYear",
        isPopularInvestor: true,
        pageSize: 5,
      },
    );

    expect(result).toBeDefined();
  });

  it("should look up a user by username", async () => {
    // First search for someone to get a valid username
    const searchResult = await ctx!.client.get<{ Items: Array<{ UserName: string }> }>(
      ctx!.paths.social("people/search"),
      {
        period: "CurrYear",
        isPopularInvestor: true,
        pageSize: 1,
      },
    );

    expect(searchResult).toBeDefined();

    if (searchResult.Items?.length > 0) {
      const username = searchResult.Items[0].UserName;
      const userResult = await ctx!.client.get(
        ctx!.paths.social("people"),
        { usernames: username },
      );
      expect(userResult).toBeDefined();
    }
  });
});
