import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TtlCache } from "../../../src/utils/cache.js";

describe("TtlCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("get", () => {
    it("returns undefined for missing keys", () => {
      const cache = new TtlCache<string>();
      expect(cache.get("missing")).toBeUndefined();
    });

    it("returns the stored value before TTL expires", () => {
      const cache = new TtlCache<number>();
      cache.set("count", 42, 5000);
      expect(cache.get("count")).toBe(42);
    });

    it("returns undefined after TTL expires", () => {
      const cache = new TtlCache<string>();
      cache.set("temp", "hello", 1000);

      vi.advanceTimersByTime(1000);

      expect(cache.get("temp")).toBeUndefined();
    });

    it("cleans up expired entries on access", () => {
      const cache = new TtlCache<string>();
      cache.set("key", "val", 500);

      vi.advanceTimersByTime(500);

      // First get returns undefined and removes entry
      expect(cache.get("key")).toBeUndefined();
      // has should also return false
      expect(cache.has("key")).toBe(false);
    });
  });

  describe("set", () => {
    it("overwrites existing entries", () => {
      const cache = new TtlCache<string>();
      cache.set("key", "first", 5000);
      cache.set("key", "second", 5000);
      expect(cache.get("key")).toBe("second");
    });

    it("allows different TTLs per entry", () => {
      const cache = new TtlCache<string>();
      cache.set("short", "a", 1000);
      cache.set("long", "b", 5000);

      vi.advanceTimersByTime(1000);

      expect(cache.get("short")).toBeUndefined();
      expect(cache.get("long")).toBe("b");
    });
  });

  describe("has", () => {
    it("returns false for missing keys", () => {
      const cache = new TtlCache<string>();
      expect(cache.has("nope")).toBe(false);
    });

    it("returns true for valid entries", () => {
      const cache = new TtlCache<string>();
      cache.set("key", "val", 5000);
      expect(cache.has("key")).toBe(true);
    });

    it("returns false for expired entries", () => {
      const cache = new TtlCache<string>();
      cache.set("key", "val", 1000);

      vi.advanceTimersByTime(1000);

      expect(cache.has("key")).toBe(false);
    });
  });

  describe("delete", () => {
    it("removes an existing entry and returns true", () => {
      const cache = new TtlCache<string>();
      cache.set("key", "val", 5000);

      expect(cache.delete("key")).toBe(true);
      expect(cache.get("key")).toBeUndefined();
    });

    it("returns false when deleting a missing key", () => {
      const cache = new TtlCache<string>();
      expect(cache.delete("missing")).toBe(false);
    });
  });

  describe("clear", () => {
    it("removes all entries", () => {
      const cache = new TtlCache<string>();
      cache.set("a", "1", 5000);
      cache.set("b", "2", 5000);
      cache.set("c", "3", 5000);

      cache.clear();

      expect(cache.get("a")).toBeUndefined();
      expect(cache.get("b")).toBeUndefined();
      expect(cache.get("c")).toBeUndefined();
    });
  });

  describe("edge cases", () => {
    it("handles zero TTL (immediately expired)", () => {
      const cache = new TtlCache<string>();
      cache.set("instant", "gone", 0);
      expect(cache.get("instant")).toBeUndefined();
    });

    it("stores falsy values correctly", () => {
      const cache = new TtlCache<number | null | string | boolean>();
      cache.set("zero", 0, 5000);
      cache.set("empty", "", 5000);
      cache.set("null", null, 5000);
      cache.set("false", false, 5000);

      expect(cache.get("zero")).toBe(0);
      expect(cache.get("empty")).toBe("");
      expect(cache.get("null")).toBeNull();
      expect(cache.get("false")).toBe(false);
    });
  });
});
