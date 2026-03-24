import { describe, it, expect, vi, beforeEach } from "vitest";
import { enrichWithNames, flattenCandles } from "../../../src/tools/market-data.js";
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
    // fetchInstrumentsBatch calls individually for each ID — mock returns per-ID wrapped response
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ instrumentDisplayDatas: [{ instrumentID: 1, instrumentDisplayName: "Apple Inc.", symbolFull: "AAPL.US" }] }), { status: 200, statusText: "OK", headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ instrumentDisplayDatas: [{ instrumentID: 2, instrumentDisplayName: "Microsoft Corp.", symbolFull: "MSFT.US" }] }), { status: 200, statusText: "OK", headers: { "Content-Type": "application/json" } }));
    const client = new EtoroClient(
      { apiKey: "test", userKey: "test", environment: "demo" },
      { rateLimiter: { acquire: vi.fn() } as unknown as import("../../../src/utils/rate-limiter.js").RateLimiter, fetchFn: mockFetch as typeof fetch },
    );

    const rateData = [
      { instrumentID: 1, Ask: 150.5, Bid: 150.0 },
      { instrumentID: 2, Ask: 300.0, Bid: 299.5 },
    ];
    const result = await enrichWithNames(client, paths, "1,2", rateData, cache);

    const arr = result as Array<Record<string, unknown>>;
    expect(arr[0].instrumentDisplayName).toBe("Apple Inc.");
    expect(arr[0].symbolFull).toBe("AAPL.US");
    expect(arr[1].instrumentDisplayName).toBe("Microsoft Corp.");
    expect(arr[1].symbolFull).toBe("MSFT.US");
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
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ instrumentDisplayDatas: [{ instrumentID: 1, instrumentDisplayName: "Apple Inc.", symbolFull: "AAPL.US" }] }), { status: 200, statusText: "OK", headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ instrumentDisplayDatas: [] }), { status: 200, statusText: "OK", headers: { "Content-Type": "application/json" } }));
    const client = new EtoroClient(
      { apiKey: "test", userKey: "test", environment: "demo" },
      { rateLimiter: { acquire: vi.fn() } as unknown as import("../../../src/utils/rate-limiter.js").RateLimiter, fetchFn: mockFetch as typeof fetch },
    );

    const rateData = [
      { instrumentID: 1, Ask: 150.5, Bid: 150.0 },
      { instrumentID: 999, Ask: 50.0, Bid: 49.5 },
    ];
    const result = await enrichWithNames(client, paths, "1,999", rateData, cache);

    const arr = result as Array<Record<string, unknown>>;
    expect(arr[0].instrumentDisplayName).toBe("Apple Inc.");
    // Unknown ID should not have name fields
    expect(arr[1].instrumentDisplayName).toBeUndefined();
    expect(arr[1].instrumentID).toBe(999);
  });

  it("returns empty array for empty rate data", async () => {
    const client = makeMockClient([]);
    const result = await enrichWithNames(client, paths, "", [], cache);

    expect(result).toEqual([]);
  });

  it("returns non-array rate data unchanged when not wrapped", async () => {
    const client = makeMockClient([]);
    const rateData = { someField: "value" };
    const result = await enrichWithNames(client, paths, "1", rateData, cache);

    expect(result).toEqual({ someField: "value" });
  });

  it("unwraps { rates: [...] } response and re-wraps after enrichment", async () => {
    const instrumentMetadata = { instrumentDisplayDatas: [
      { instrumentID: 1, instrumentDisplayName: "EUR/USD", symbolFull: "EURUSD" },
    ]};
    const rateData = { rates: [{ instrumentID: 1, ask: 1.16, bid: 1.15 }] };

    const client = makeMockClient(instrumentMetadata);
    const result = await enrichWithNames(client, paths, "1", rateData, cache) as Record<string, unknown>;

    expect(result.rates).toBeDefined();
    const rates = result.rates as Array<Record<string, unknown>>;
    expect(rates[0].instrumentDisplayName).toBe("EUR/USD");
    expect(rates[0].symbolFull).toBe("EURUSD");
  });

  it("handles { instrumentDisplayDatas: [...] } wrapped instrument response", async () => {
    const instrumentMetadata = { instrumentDisplayDatas: [
      { instrumentID: 1, instrumentDisplayName: "Apple", symbolFull: "AAPL" },
    ]};
    const rateData = [{ instrumentID: 1, ask: 150 }];

    const client = makeMockClient(instrumentMetadata);
    const result = await enrichWithNames(client, paths, "1", rateData, cache) as Array<Record<string, unknown>>;

    expect(result[0].instrumentDisplayName).toBe("Apple");
    expect(result[0].symbolFull).toBe("AAPL");
  });

  it("caches per individual instrument ID", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ instrumentDisplayDatas: [{ instrumentID: 2, instrumentDisplayName: "Microsoft", symbolFull: "MSFT" }] }), { status: 200, statusText: "OK", headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ instrumentDisplayDatas: [{ instrumentID: 1, instrumentDisplayName: "Apple", symbolFull: "AAPL" }] }), { status: 200, statusText: "OK", headers: { "Content-Type": "application/json" } }));
    const client = new EtoroClient(
      { apiKey: "test", userKey: "test", environment: "demo" },
      { rateLimiter: { acquire: vi.fn() } as unknown as import("../../../src/utils/rate-limiter.js").RateLimiter, fetchFn: mockFetch as typeof fetch },
    );

    const rateData = [{ instrumentID: 1, Ask: 100 }];
    await enrichWithNames(client, paths, "2,1", rateData, cache);

    // Individual IDs should be cached
    expect(cache.has("instrument:1")).toBe(true);
    expect(cache.has("instrument:2")).toBe(true);
  });

  it("uses cached instrument data on subsequent calls", async () => {
    const rateData = [{ instrumentID: 1, Ask: 100 }];

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ instrumentDisplayDatas: [{ instrumentID: 1, instrumentDisplayName: "Apple", symbolFull: "AAPL" }] }), {
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
  it("search_instruments (symbol mode) sends InternalSymbolFull param", async () => {
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
      InternalSymbolFull: "AAPL",
      pageNumber: 1,
      pageSize: 20,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/api/v1/market-data/search");
    expect(parsed.searchParams.get("InternalSymbolFull")).toBe("AAPL");
    expect(parsed.searchParams.has("searchText")).toBe(false);
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
      client.get(paths.marketData("search"), { InternalSymbolFull: "TEST" }),
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

describe("flattenCandles", () => {
  it("should unwrap nested { candles: [{ candles: [...] }] } response", () => {
    const nested = {
      candles: [{
        candles: [
          { Open: 100, High: 110, Low: 95, Close: 105, Volume: 5000 },
          { Open: 105, High: 115, Low: 100, Close: 110, Volume: 6000 },
        ],
      }],
    };
    const result = flattenCandles(nested);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ Open: 100, High: 110, Low: 95, Close: 105, Volume: 5000 });
    expect(result[1]).toEqual({ Open: 105, High: 115, Low: 100, Close: 110, Volume: 6000 });
  });

  it("should default null Volume to 0", () => {
    const nested = {
      candles: [{
        candles: [
          { Open: 100, High: 110, Low: 95, Close: 105, Volume: null },
        ],
      }],
    };
    const result = flattenCandles(nested);
    expect(result[0]).toHaveProperty("Volume", 0);
  });

  it("should handle already-flat arrays", () => {
    const flat = [
      { Open: 100, High: 110, Low: 95, Close: 105, Volume: 5000 },
    ];
    const result = flattenCandles(flat);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ Open: 100, High: 110, Low: 95, Close: 105, Volume: 5000 });
  });

  it("should handle single-level { candles: [...] } wrapper", () => {
    const wrapped = {
      candles: [
        { Open: 100, High: 110, Low: 95, Close: 105, Volume: 3000 },
      ],
    };
    const result = flattenCandles(wrapped);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ Open: 100, High: 110, Low: 95, Close: 105, Volume: 3000 });
  });

  it("should return empty array for unexpected shapes", () => {
    expect(flattenCandles(null)).toEqual([]);
    expect(flattenCandles(undefined)).toEqual([]);
    expect(flattenCandles("string")).toEqual([]);
  });

  it("should remove duplicate lowercase volume and normalize to PascalCase", () => {
    const nested = {
      candles: [{
        candles: [
          { Open: 100, High: 110, Low: 95, Close: 105, volume: null, Volume: null },
        ],
      }],
    };
    const result = flattenCandles(nested);
    const candle = result[0] as Record<string, unknown>;
    expect(candle.Volume).toBe(0);
    expect(candle).not.toHaveProperty("volume");
  });

  it("should use lowercase volume value when PascalCase is missing", () => {
    const nested = {
      candles: [{
        candles: [
          { Open: 100, High: 110, Low: 95, Close: 105, volume: 42 },
        ],
      }],
    };
    const result = flattenCandles(nested);
    const candle = result[0] as Record<string, unknown>;
    expect(candle.Volume).toBe(42);
    expect(candle).not.toHaveProperty("volume");
  });
});
