import { describe, it, expect } from "vitest";
import { createTestClient, skipIfNoCredentials } from "./setup.js";

const skip = skipIfNoCredentials();
const ctx = skip ? null : createTestClient()!;

describe.skipIf(skip)("Integration: Watchlists", () => {
  it("should list all watchlists", async () => {
    const result = await ctx!.client.get(ctx!.paths.watchlists());

    expect(result).toBeDefined();
  });

  it("should create, rename, and delete a watchlist", async () => {
    // Create
    const created = await ctx!.client.post<{ WatchlistId: string }>(
      ctx!.paths.watchlists(),
      { name: "Integration Test Watchlist" },
    );
    expect(created).toBeDefined();
    expect(created.WatchlistId).toBeDefined();

    const watchlistId = created.WatchlistId;

    // Rename
    await ctx!.client.put(
      ctx!.paths.watchlists(`${watchlistId}/rename`),
      undefined,
    );

    // Delete
    await ctx!.client.delete(ctx!.paths.watchlists(watchlistId));
  });
});
