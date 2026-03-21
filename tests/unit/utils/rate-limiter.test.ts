import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RateLimiter } from "../../../src/utils/rate-limiter.js";

describe("RateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests within GET limit", async () => {
    const limiter = new RateLimiter({ getLimit: 3, windowMs: 1000 });

    await limiter.acquire("GET");
    await limiter.acquire("GET");
    await limiter.acquire("GET");

    // All three should resolve without waiting
  });

  it("allows requests within WRITE limit", async () => {
    const limiter = new RateLimiter({ writeLimit: 2, windowMs: 1000 });

    await limiter.acquire("WRITE");
    await limiter.acquire("WRITE");
  });

  it("waits when GET bucket is full", async () => {
    const limiter = new RateLimiter({ getLimit: 2, windowMs: 1000 });

    await limiter.acquire("GET");
    await limiter.acquire("GET");

    // Third acquire should wait
    let resolved = false;
    const promise = limiter.acquire("GET").then(() => {
      resolved = true;
    });

    // Not yet resolved
    expect(resolved).toBe(false);

    // Advance time past the window
    await vi.advanceTimersByTimeAsync(1000);

    await promise;
    expect(resolved).toBe(true);
  });

  it("waits when WRITE bucket is full", async () => {
    const limiter = new RateLimiter({ writeLimit: 1, windowMs: 500 });

    await limiter.acquire("WRITE");

    let resolved = false;
    const promise = limiter.acquire("WRITE").then(() => {
      resolved = true;
    });

    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(500);

    await promise;
    expect(resolved).toBe(true);
  });

  it("uses default limits (60 GET, 20 WRITE, 60s window)", async () => {
    const limiter = new RateLimiter();

    // Should handle 20 WRITE requests
    for (let i = 0; i < 20; i++) {
      await limiter.acquire("WRITE");
    }

    // 21st should need to wait
    let resolved = false;
    const promise = limiter.acquire("WRITE").then(() => {
      resolved = true;
    });

    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(60_000);
    await promise;
    expect(resolved).toBe(true);
  });

  it("GET and WRITE buckets are independent", async () => {
    const limiter = new RateLimiter({
      getLimit: 1,
      writeLimit: 1,
      windowMs: 1000,
    });

    // Fill GET bucket
    await limiter.acquire("GET");

    // WRITE should still be available
    await limiter.acquire("WRITE");
  });

  it("expires old timestamps allowing new requests", async () => {
    const limiter = new RateLimiter({ getLimit: 1, windowMs: 1000 });

    await limiter.acquire("GET");

    // Advance past window
    await vi.advanceTimersByTimeAsync(1001);

    // Should resolve immediately since old timestamp expired
    await limiter.acquire("GET");
  });

  describe("reset", () => {
    it("clears all timestamps", async () => {
      const limiter = new RateLimiter({ getLimit: 1, writeLimit: 1, windowMs: 1000 });

      await limiter.acquire("GET");
      await limiter.acquire("WRITE");

      limiter.reset();

      // Both buckets should be empty — new acquires resolve immediately
      await limiter.acquire("GET");
      await limiter.acquire("WRITE");
    });
  });

  it("calculates correct wait time from oldest timestamp", async () => {
    const limiter = new RateLimiter({ getLimit: 2, windowMs: 1000 });

    // First request at t=0
    await limiter.acquire("GET");

    // Advance 300ms, second request at t=300
    await vi.advanceTimersByTimeAsync(300);
    await limiter.acquire("GET");

    // Third request — should wait until t=1000 (oldest + windowMs)
    let resolved = false;
    const promise = limiter.acquire("GET").then(() => {
      resolved = true;
    });

    // At t=300, need to wait 700ms for oldest (t=0) to expire
    expect(resolved).toBe(false);

    // Advance 699ms — should still be waiting
    await vi.advanceTimersByTimeAsync(699);
    expect(resolved).toBe(false);

    // Advance 1 more ms — now oldest has expired
    await vi.advanceTimersByTimeAsync(1);
    await promise;
    expect(resolved).toBe(true);
  });
});
