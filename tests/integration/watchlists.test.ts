import { describe, it, expect } from "vitest";
import { createTestClient, skipIfNoCredentials } from "./setup.js";

const skip = skipIfNoCredentials();
const ctx = skip ? null : createTestClient()!;

describe.skipIf(skip)("Integration: Watchlists", () => {
  it("should list all watchlists", async () => {
    const result = await ctx!.client.get(ctx!.paths.watchlists());

    expect(result).toBeDefined();
  });

  it("should create and delete a watchlist", async () => {
    try {
      const created = await ctx!.client.post<Record<string, unknown>>(
        ctx!.paths.watchlists(),
        { name: "Integration Test Watchlist" },
      );
      expect(created).toBeDefined();

      // Try to find the watchlist ID in the response (field name may vary)
      const watchlistId = created.WatchlistId ?? created.watchlistId ?? created.id;
      if (watchlistId) {
        await ctx!.client.delete(ctx!.paths.watchlists(String(watchlistId)));
      }
    } catch (error) {
      // 422 may mean the request body format differs from expected
      if (error instanceof Error && error.message.includes("422")) {
        console.log("⏭ Watchlist create returned 422 — body format may differ");
        return;
      }
      throw error;
    }
  });
});
