import { describe, it, expect, vi, beforeEach } from "vitest";
import { EtoroClient } from "../../src/client.js";
import { EtoroApiError } from "../../src/types/errors.js";
import { RateLimiter } from "../../src/utils/rate-limiter.js";
import type { EtoroConfig } from "../../src/types/config.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function makeConfig(overrides?: Partial<EtoroConfig>): EtoroConfig {
  return {
    apiKey: "test-api-key",
    userKey: "test-user-key",
    environment: "demo",
    ...overrides,
  };
}

function makeRateLimiter(): RateLimiter {
  return new RateLimiter({ getLimit: 10_000, writeLimit: 10_000 });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: { "Content-Type": "application/json" },
  });
}

function textResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    statusText: "Error",
    headers: { "Content-Type": "text/plain" },
  });
}

function emptyResponse(): Response {
  return new Response("", { status: 200, statusText: "OK" });
}

function rateLimitResponse(retryAfter?: string): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (retryAfter) {
    headers["Retry-After"] = retryAfter;
  }
  return new Response(JSON.stringify({ message: "Rate limited" }), {
    status: 429,
    statusText: "Too Many Requests",
    headers,
  });
}

describe("EtoroClient", () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let client: EtoroClient;

  beforeEach(() => {
    mockFetch = vi.fn();
    client = new EtoroClient(makeConfig(), {
      rateLimiter: makeRateLimiter(),
      fetchFn: mockFetch as typeof fetch,
    });
  });

  describe("auth headers", () => {
    it("sets x-api-key and x-user-key from config", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

      await client.get("/api/v1/test");

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers["x-api-key"]).toBe("test-api-key");
      expect(headers["x-user-key"]).toBe("test-user-key");
    });

    it("includes Content-Type application/json", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

      await client.get("/api/v1/test");

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers["Content-Type"]).toBe("application/json");
    });
  });

  describe("x-request-id", () => {
    it("is a valid UUID", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

      await client.get("/api/v1/test");

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers["x-request-id"]).toMatch(UUID_REGEX);
    });

    it("is unique per request", async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ ok: true }))
        .mockResolvedValueOnce(jsonResponse({ ok: true }));

      await client.get("/api/v1/a");
      await client.get("/api/v1/b");

      const id1 = (
        (mockFetch.mock.calls[0] as [string, RequestInit])[1]
          .headers as Record<string, string>
      )["x-request-id"];
      const id2 = (
        (mockFetch.mock.calls[1] as [string, RequestInit])[1]
          .headers as Record<string, string>
      )["x-request-id"];
      expect(id1).not.toBe(id2);
    });
  });

  describe("GET query params", () => {
    it("appends query params to the URL", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

      await client.get("/api/v1/search", {
        query: "AAPL",
        page: 1,
        active: true,
      });

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      const parsed = new URL(url);
      expect(parsed.searchParams.get("query")).toBe("AAPL");
      expect(parsed.searchParams.get("page")).toBe("1");
      expect(parsed.searchParams.get("active")).toBe("true");
    });

    it("excludes undefined param values", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

      await client.get("/api/v1/search", {
        query: "AAPL",
        page: undefined,
      });

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      const parsed = new URL(url);
      expect(parsed.searchParams.get("query")).toBe("AAPL");
      expect(parsed.searchParams.has("page")).toBe(false);
    });
  });

  describe("request body", () => {
    it("POST sends JSON body", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1 }));
      const body = { InstrumentID: 1, IsBuy: true, Amount: 100 };

      await client.post("/api/v1/orders", body);

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(init.method).toBe("POST");
      expect(init.body).toBe(JSON.stringify(body));
    });

    it("PUT sends JSON body", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ updated: true }));
      const body = { name: "My Watchlist" };

      await client.put("/api/v1/watchlists/1", body);

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(init.method).toBe("PUT");
      expect(init.body).toBe(JSON.stringify(body));
    });

    it("DELETE sends JSON body when provided", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ deleted: true }));
      const body = { reason: "cleanup" };

      await client.delete("/api/v1/items/1", body);

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(init.method).toBe("DELETE");
      expect(init.body).toBe(JSON.stringify(body));
    });

    it("PATCH sends JSON body", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ patched: true }));
      const body = { name: "Updated" };

      await client.patch("/api/v1/items/1", body);

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(init.method).toBe("PATCH");
      expect(init.body).toBe(JSON.stringify(body));
    });
  });

  describe("response parsing", () => {
    it("parses successful JSON response", async () => {
      const data = { instruments: [{ id: 1, name: "AAPL" }] };
      mockFetch.mockResolvedValueOnce(jsonResponse(data));

      const result = await client.get("/api/v1/instruments");

      expect(result).toEqual(data);
    });

    it("returns undefined for empty response body", async () => {
      mockFetch.mockResolvedValueOnce(emptyResponse());

      const result = await client.delete("/api/v1/items/1");

      expect(result).toBeUndefined();
    });
  });

  describe("error handling", () => {
    it("throws EtoroApiError with statusCode and parsed body for JSON errors", async () => {
      const errorBody = { message: "Not found", errorCode: "RESOURCE_NOT_FOUND" };
      mockFetch.mockResolvedValueOnce(jsonResponse(errorBody, 404));

      await expect(client.get("/api/v1/missing")).rejects.toThrow(EtoroApiError);

      try {
        await client.get("/api/v1/missing");
      } catch (error) {
        // First call already consumed, need a fresh mock
      }

      // Re-test with fresh mock for detailed assertions
      mockFetch.mockResolvedValueOnce(jsonResponse(errorBody, 404));
      try {
        await client.get("/api/v1/missing");
        expect.unreachable("Should have thrown");
      } catch (error) {
        const apiError = error as EtoroApiError;
        expect(apiError).toBeInstanceOf(EtoroApiError);
        expect(apiError.statusCode).toBe(404);
        expect(apiError.errorCode).toBe("RESOURCE_NOT_FOUND");
        expect(apiError.body).toEqual(errorBody);
        expect(apiError.message).toBe("Not found");
      }
    });

    it("uses default message when error body has no message field", async () => {
      mockFetch.mockResolvedValueOnce(
        textResponse("Server broke", 500),
      );

      try {
        await client.get("/api/v1/broken");
        expect.unreachable("Should have thrown");
      } catch (error) {
        const apiError = error as EtoroApiError;
        expect(apiError).toBeInstanceOf(EtoroApiError);
        expect(apiError.statusCode).toBe(500);
        expect(apiError.message).toBe("HTTP 500: Error");
      }
    });

    it("does NOT retry non-429 errors", async () => {
      const errorBody = { message: "Bad request" };
      mockFetch.mockResolvedValueOnce(jsonResponse(errorBody, 400));

      await expect(client.get("/api/v1/bad")).rejects.toThrow(EtoroApiError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("429 retry logic", () => {
    it("retries on 429 with exponential backoff", async () => {
      vi.useFakeTimers();

      mockFetch
        .mockResolvedValueOnce(rateLimitResponse())
        .mockResolvedValueOnce(jsonResponse({ ok: true }));

      const promise = client.get("/api/v1/test");

      // First call happens immediately, then it schedules a setTimeout for backoff
      // Attempt 0 -> 1000 * 2^0 = 1000ms delay
      await vi.advanceTimersByTimeAsync(1000);

      const result = await promise;
      expect(result).toEqual({ ok: true });
      expect(mockFetch).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it("uses Retry-After header when present", async () => {
      vi.useFakeTimers();

      mockFetch
        .mockResolvedValueOnce(rateLimitResponse("5"))
        .mockResolvedValueOnce(jsonResponse({ ok: true }));

      const promise = client.get("/api/v1/test");

      // Retry-After: 5 -> 5000ms delay
      await vi.advanceTimersByTimeAsync(5000);

      const result = await promise;
      expect(result).toEqual({ ok: true });
      expect(mockFetch).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it("throws after exhausting all retries on repeated 429", async () => {
      vi.useFakeTimers();

      // 4 calls: initial + 3 retries, all return 429
      mockFetch
        .mockImplementation(() =>
          Promise.resolve(rateLimitResponse()),
        );

      const promise = client.get("/api/v1/test");

      // Attach the rejection handler immediately to avoid unhandled rejection warnings
      const assertion = expect(promise).rejects.toThrow(EtoroApiError);

      // Advance through all backoff delays
      await vi.runAllTimersAsync();

      // The last 429 (attempt === MAX_RETRIES) falls through to !response.ok
      // and throws EtoroApiError
      await assertion;
      expect(mockFetch).toHaveBeenCalledTimes(4);

      vi.useRealTimers();
    });
  });

  describe("URL construction", () => {
    it("builds URL from base and path", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

      await client.get("/api/v1/instruments");

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://public-api.etoro.com/api/v1/instruments");
    });
  });
});
