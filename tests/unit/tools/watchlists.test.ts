import { describe, it, expect, vi } from "vitest";
import { EtoroClient } from "../../../src/client.js";
import { createPathResolver } from "../../../src/utils/path-resolver.js";
import { registerWatchlistTools } from "../../../src/tools/watchlists.js";
import { createMockServer, createMockClient } from "../../helpers/mock-mcp.js";

const paths = createPathResolver("demo");

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

describe("manage_watchlists handler", () => {
  function setup() {
    const client = createMockClient({
      get: vi.fn().mockResolvedValue({}),
      post: vi.fn().mockResolvedValue({}),
      put: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    });
    const { tool, handlers } = createMockServer();
    registerWatchlistTools(tool as any, client, paths);
    return { client, handler: handlers.get("manage_watchlists")! };
  }

  it("list", async () => {
    const { client, handler } = setup();
    await handler({ action: "list" });
    expect(client.get).toHaveBeenCalledWith(paths.watchlists());
  });

  it("get", async () => {
    const { client, handler } = setup();
    await handler({ action: "get", watchlistId: "w1" });
    expect(client.get).toHaveBeenCalledWith(paths.watchlists("w1"));
  });

  it("rejects get without watchlistId", async () => {
    const { handler } = setup();
    const result = await handler({ action: "get" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("watchlistId is required");
  });

  it("create", async () => {
    const { client, handler } = setup();
    await handler({ action: "create", name: "My List" });
    expect(client.post).toHaveBeenCalledWith(paths.watchlists(), { name: "My List" });
  });

  it("rejects create without name", async () => {
    const { handler } = setup();
    const result = await handler({ action: "create" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("name is required for create");
  });

  it("delete", async () => {
    const { client, handler } = setup();
    await handler({ action: "delete", watchlistId: "w1" });
    expect(client.delete).toHaveBeenCalledWith(paths.watchlists("w1"));
  });

  it("rename", async () => {
    const { client, handler } = setup();
    await handler({ action: "rename", watchlistId: "w1", name: "New Name" });
    expect(client.put).toHaveBeenCalledWith(paths.watchlists("w1/rename"), { name: "New Name" });
  });

  it("rejects rename missing watchlistId or name", async () => {
    const { handler } = setup();
    const result = await handler({ action: "rename", watchlistId: "w1" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("watchlistId and name are required for rename");
  });

  it("rank", async () => {
    const { client, handler } = setup();
    await handler({ action: "rank", watchlistId: "w1", rank: 2 });
    expect(client.put).toHaveBeenCalledWith(paths.watchlists("w1/rank"), { rank: 2 });
  });

  it("rejects rank missing watchlistId or rank", async () => {
    const { handler } = setup();
    const result = await handler({ action: "rank", watchlistId: "w1" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("watchlistId and rank are required");
  });

  it("add_items parses comma-separated instrument IDs to numbers", async () => {
    const { client, handler } = setup();
    await handler({ action: "add_items", watchlistId: "w1", instrumentIds: "1,2,3" });
    expect(client.post).toHaveBeenCalledWith(paths.watchlists("w1/items"), [1, 2, 3]);
  });

  it("rejects add_items missing watchlistId or instrumentIds", async () => {
    const { handler } = setup();
    const result = await handler({ action: "add_items", watchlistId: "w1" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("watchlistId and instrumentIds are required");
  });

  it("remove_items parses comma-separated instrument IDs to numbers", async () => {
    const { client, handler } = setup();
    await handler({ action: "remove_items", watchlistId: "w1", instrumentIds: "4,5" });
    expect(client.delete).toHaveBeenCalledWith(paths.watchlists("w1/items"), [4, 5]);
  });

  it("update_items parses the items JSON", async () => {
    const { client, handler } = setup();
    await handler({ action: "update_items", watchlistId: "w1", items: '[{"instrumentId":1}]' });
    expect(client.put).toHaveBeenCalledWith(paths.watchlists("w1/items"), [{ instrumentId: 1 }]);
  });

  it("rejects update_items missing watchlistId or items", async () => {
    const { handler } = setup();
    const result = await handler({ action: "update_items", watchlistId: "w1" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("watchlistId and items JSON are required");
  });

  it("set_default", async () => {
    const { client, handler } = setup();
    await handler({ action: "set_default", watchlistId: "w1" });
    expect(client.put).toHaveBeenCalledWith(paths.watchlists("setUserSelectedUserDefault/w1"));
  });

  it("rejects set_default without watchlistId", async () => {
    const { handler } = setup();
    const result = await handler({ action: "set_default" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("watchlistId is required");
  });

  it("get_default with pageSize as itemsLimit", async () => {
    const { client, handler } = setup();
    await handler({ action: "get_default", pageSize: 25 });
    expect(client.get).toHaveBeenCalledWith(paths.watchlists("default-watchlists/items"), { itemsLimit: 25 });
  });

  it("create_default_items parses the items JSON", async () => {
    const { client, handler } = setup();
    await handler({ action: "create_default_items", items: '[{"instrumentId":1}]' });
    expect(client.post).toHaveBeenCalledWith(paths.watchlists("default-watchlist/selected-items"), [{ instrumentId: 1 }]);
  });

  it("rejects create_default_items without items", async () => {
    const { handler } = setup();
    const result = await handler({ action: "create_default_items" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("items JSON is required");
  });

  it("create_as_default", async () => {
    const { client, handler } = setup();
    await handler({ action: "create_as_default", name: "Default List" });
    expect(client.post).toHaveBeenCalledWith(paths.watchlists("newasdefault-watchlist"), { name: "Default List" });
  });

  it("rejects create_as_default without name", async () => {
    const { handler } = setup();
    const result = await handler({ action: "create_as_default" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("name is required");
  });

  it("get_public with pageSize as itemsPerPageForSingle", async () => {
    const { client, handler } = setup();
    await handler({ action: "get_public", userId: "u1", pageSize: 10 });
    expect(client.get).toHaveBeenCalledWith(paths.watchlists("public/u1"), { itemsPerPageForSingle: 10 });
  });

  it("rejects get_public without userId", async () => {
    const { handler } = setup();
    const result = await handler({ action: "get_public" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("userId is required");
  });

  it("get_public_single with page/pageSize mapped to pageNumber/itemsPerPage", async () => {
    const { client, handler } = setup();
    await handler({ action: "get_public_single", userId: "u1", watchlistId: "w1", page: 2, pageSize: 10 });
    expect(client.get).toHaveBeenCalledWith(paths.watchlists("public/u1/w1"), { pageNumber: 2, itemsPerPage: 10 });
  });

  it("rejects get_public_single missing userId or watchlistId", async () => {
    const { handler } = setup();
    const result = await handler({ action: "get_public_single", userId: "u1" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("userId and watchlistId are required");
  });

  it("returns errorContent when the client throws", async () => {
    const client = createMockClient({ get: vi.fn().mockRejectedValue(new Error("network down")) });
    const { tool, handlers } = createMockServer();
    registerWatchlistTools(tool as any, client, paths);

    const result = await handlers.get("manage_watchlists")!({ action: "list" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to manage watchlist: network down");
  });
});
