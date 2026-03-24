import { describe, it, expect, vi } from "vitest";
import { EtoroClient } from "../../../src/client.js";
import { createPathResolver } from "../../../src/utils/path-resolver.js";

function makeMockClient() {
  const mockFetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      statusText: "OK",
      headers: { "Content-Type": "application/json" },
    }),
  );
  const client = new EtoroClient(
    { apiKey: "test", userKey: "test", environment: "demo" },
    {
      rateLimiter: { acquire: vi.fn() } as unknown as import("../../../src/utils/rate-limiter.js").RateLimiter,
      fetchFn: mockFetch as typeof fetch,
    },
  );
  return { client, mockFetch };
}

describe("watchlist API calls", () => {
  const paths = createPathResolver("demo");

  it("rename sends name in request body", async () => {
    const { client, mockFetch } = makeMockClient();

    await client.put(paths.watchlists("abc-123/rename"), { name: "New Name" });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/watchlists/abc-123/rename");
    expect(JSON.parse(init.body as string)).toEqual({ name: "New Name" });
  });

  it("rename does NOT send undefined body", async () => {
    const { client, mockFetch } = makeMockClient();

    // This was the bug: body was undefined instead of { name }
    await client.put(paths.watchlists("abc-123/rename"), { name: "Test" });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.name).toBe("Test");
    expect(body.name).not.toBeUndefined();
  });

  it("create_as_default sends name in request body", async () => {
    const { client, mockFetch } = makeMockClient();

    await client.post(paths.watchlists("newasdefault-watchlist"), { name: "My Default" });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/watchlists/newasdefault-watchlist");
    expect(JSON.parse(init.body as string)).toEqual({ name: "My Default" });
  });

  it("rank sends rank number in request body", async () => {
    const { client, mockFetch } = makeMockClient();

    await client.put(paths.watchlists("abc-123/rank"), { rank: 3 });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/watchlists/abc-123/rank");
    expect(JSON.parse(init.body as string)).toEqual({ rank: 3 });
  });

  it("create sends name in request body", async () => {
    const { client, mockFetch } = makeMockClient();

    await client.post(paths.watchlists(), { name: "AI Stocks" });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/watchlists");
    expect(JSON.parse(init.body as string)).toEqual({ name: "AI Stocks" });
  });

  it("add_items sends array of numeric IDs", async () => {
    const { client, mockFetch } = makeMockClient();

    const ids = [1137, 1001, 1003];
    await client.post(paths.watchlists("abc-123/items"), ids);

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/watchlists/abc-123/items");
    expect(JSON.parse(init.body as string)).toEqual([1137, 1001, 1003]);
  });

  it("delete removes watchlist by ID", async () => {
    const { client, mockFetch } = makeMockClient();

    await client.delete(paths.watchlists("abc-123"));

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/watchlists/abc-123");
    expect(init.method).toBe("DELETE");
  });
});
