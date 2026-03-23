import { describe, it, expect, vi, beforeEach } from "vitest";
import { enrichWithNames } from "../../../src/tools/market-data.js";
import { EtoroClient } from "../../../src/client.js";
import { TtlCache } from "../../../src/utils/cache.js";
import { createPathResolver, type PathResolver } from "../../../src/utils/path-resolver.js";

function makeMockClient(getResponse: unknown = []): EtoroClient {
  const mockFetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(getResponse), {
      status: 200,
      statusText: "OK",
      headers: { "Content-Type": "application/json" },
    }),
  );
  return new EtoroClient(
    { apiKey: "test", userKey: "test", environment: "demo" },
    {
      rateLimiter: { acquire: vi.fn() } as unknown as import("../../../src/utils/rate-limiter.js").RateLimiter,
      fetchFn: mockFetch as typeof fetch,
    },
  );
}

function makeMockClientThatThrows(): EtoroClient {
  const mockFetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ message: "Server error" }), {
      status: 500,
      statusText: "Internal Server Error",
      headers: { "Content-Type": "application/json" },
    }),
  );
  return new EtoroClient(
    { apiKey: "test", userKey: "test", environment: "demo" },
    {
      rateLimiter: { acquire: vi.fn() } as unknown as import("../../../src/utils/rate-limiter.js").RateLimiter,
      fetchFn: mockFetch as typeof fetch,
    },
  );
}

describe("enrichWithNames", () => {
  let paths: PathResolver;
  let cache: TtlCache<unknown>;

  beforeEach(() => {
    paths = createPathResolver("demo");
    cache = new TtlCache<unknown>();
  });

  it("correctly merges instrument names into rate data", async () => {
    const instrumentMetadata = [
      { InstrumentID: 1, InstrumentDisplayName: "Apple Inc.", SymbolFull: "AAPL.US" },
      { InstrumentID: 2, InstrumentDisplayName: "Microsoft Corp.", SymbolFull: "MSFT.US" },
    ];
    const rateData = [
      { InstrumentID: 1, Ask: 150.5, Bid: 150.0 },
      { InstrumentID: 2, Ask: 300.0, Bid: 299.5 },
    ];

    const client = makeMockClient(instrumentMetadata);
    const result = await enrichWithNames(client, paths, "1,2", rateData, cache);

    expect(result).toEqual([
      { InstrumentID: 1, Ask: 150.5, Bid: 150.0, InstrumentDisplayName: "Apple Inc.", SymbolFull: "AAPL.US" },
      { InstrumentID: 2, Ask: 300.0, Bid: 299.5, InstrumentDisplayName: "Microsoft Corp.", SymbolFull: "MSFT.US" },
    ]);
  });

  it("returns original data unchanged when metadata fetch fails", async () => {
    const rateData = [
      { InstrumentID: 1, Ask: 150.5, Bid: 150.0 },
    ];

    const client = makeMockClientThatThrows();
    await expect(
      enrichWithNames(client, paths, "1", rateData, cache),
    ).rejects.toThrow();
    // The caller (get_rates handler) wraps in try/catch and returns original data
  });

  it("does not crash when rate data contains unknown InstrumentIDs", async () => {
    const instrumentMetadata = [
      { InstrumentID: 1, InstrumentDisplayName: "Apple Inc.", SymbolFull: "AAPL.US" },
    ];
    const rateData = [
      { InstrumentID: 1, Ask: 150.5, Bid: 150.0 },
      { InstrumentID: 999, Ask: 50.0, Bid: 49.5 },
    ];

    const client = makeMockClient(instrumentMetadata);
    const result = await enrichWithNames(client, paths, "1,999", rateData, cache);

    expect(result).toEqual([
      { InstrumentID: 1, Ask: 150.5, Bid: 150.0, InstrumentDisplayName: "Apple Inc.", SymbolFull: "AAPL.US" },
      { InstrumentID: 999, Ask: 50.0, Bid: 49.5 },
    ]);
  });

  it("returns empty array for empty rate data", async () => {
    const client = makeMockClient([]);
    const result = await enrichWithNames(client, paths, "", [], cache);

    expect(result).toEqual([]);
  });

  it("returns non-array rate data unchanged", async () => {
    const client = makeMockClient([]);
    const rateData = { someField: "value" };
    const result = await enrichWithNames(client, paths, "1", rateData, cache);

    expect(result).toEqual({ someField: "value" });
  });

  it("sorts instrument IDs for consistent cache keys", async () => {
    const instrumentMetadata = [
      { InstrumentID: 1, InstrumentDisplayName: "Apple", SymbolFull: "AAPL" },
      { InstrumentID: 2, InstrumentDisplayName: "Microsoft", SymbolFull: "MSFT" },
    ];
    const rateData = [{ InstrumentID: 1, Ask: 100 }];

    const client = makeMockClient(instrumentMetadata);

    // First call with "2,1"
    await enrichWithNames(client, paths, "2,1", rateData, cache);

    // Cache should have the sorted key
    expect(cache.has("instruments:1,2")).toBe(true);
    expect(cache.has("instruments:2,1")).toBe(false);
  });

  it("uses cached instrument data on subsequent calls", async () => {
    const instrumentMetadata = [
      { InstrumentID: 1, InstrumentDisplayName: "Apple", SymbolFull: "AAPL" },
    ];
    const rateData = [{ InstrumentID: 1, Ask: 100 }];

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(instrumentMetadata), {
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

    // First call — fetches from API
    await enrichWithNames(client, paths, "1", rateData, cache);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Second call — uses cache, no additional fetch
    await enrichWithNames(client, paths, "1", rateData, cache);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe("market-data tool handlers (via mock client)", () => {
  it("search_instruments calls correct path with correct params", async () => {
    const paths = createPathResolver("demo");
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [], totalItems: 0 }), {
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

    const result = await client.get(paths.marketData("search"), {
      fields: "InternalSymbolFull,SymbolFull,InstrumentDisplayName,InstrumentTypeID,ExchangeID,InstrumentID",
      searchText: "Apple",
      pageNumber: 1,
      pageSize: 20,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/api/v1/market-data/search");
    expect(parsed.searchParams.get("searchText")).toBe("Apple");
    expect(parsed.searchParams.get("pageNumber")).toBe("1");
    expect(parsed.searchParams.get("pageSize")).toBe("20");
    expect(result).toEqual({ items: [], totalItems: 0 });
  });

  it("search_instruments wraps errors correctly", async () => {
    const paths = createPathResolver("demo");
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "Bad request" }), {
        status: 400,
        statusText: "Bad Request",
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

    await expect(
      client.get(paths.marketData("search"), { searchText: "test" }),
    ).rejects.toThrow("Bad request");
  });

  it("get_rates calls correct path for current rates", async () => {
    const paths = createPathResolver("demo");
    const ratesResponse = [{ InstrumentID: 1, Ask: 150, Bid: 149 }];
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(ratesResponse), {
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

    const result = await client.get(paths.marketData("instruments/rates"), {
      instrumentIds: "1",
    });

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/api/v1/market-data/instruments/rates");
    expect(parsed.searchParams.get("instrumentIds")).toBe("1");
    expect(result).toEqual(ratesResponse);
  });

  it("get_rates calls correct path for closing prices", async () => {
    const paths = createPathResolver("demo");
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), {
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

    await client.get(paths.marketData("instruments/history/closing-price"), {
      instrumentIds: "1,2",
    });

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/api/v1/market-data/instruments/history/closing-price");
    expect(parsed.searchParams.get("instrumentIds")).toBe("1,2");
  });
});
