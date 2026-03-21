import { describe, it, expect } from "vitest";
import {
  createPathResolver,
  type Environment,
  type PathResolver,
} from "../../../src/utils/path-resolver.js";

describe("createPathResolver", () => {
  const demo = createPathResolver("demo");
  const real = createPathResolver("real");

  describe("trading", () => {
    it("returns demo execution path with /demo/ segment", () => {
      expect(demo.trading("open")).toBe(
        "/api/v1/trading/execution/demo/open"
      );
    });

    it("returns real execution path without /demo/ segment", () => {
      expect(real.trading("open")).toBe("/api/v1/trading/execution/open");
    });

    it("handles nested subpaths", () => {
      expect(demo.trading("limit/close")).toBe(
        "/api/v1/trading/execution/demo/limit/close"
      );
      expect(real.trading("limit/close")).toBe(
        "/api/v1/trading/execution/limit/close"
      );
    });
  });

  describe("portfolio (asymmetric)", () => {
    it("returns demo path with /demo/ segment", () => {
      expect(demo.portfolio()).toBe("/api/v1/trading/info/demo/portfolio");
    });

    it("returns real path WITHOUT /real/ segment", () => {
      expect(real.portfolio()).toBe("/api/v1/trading/info/portfolio");
    });
  });

  describe("pnl (asymmetric)", () => {
    it("returns demo path with /demo/ segment", () => {
      expect(demo.pnl()).toBe("/api/v1/trading/info/demo/pnl");
    });

    it("returns real path WITH /real/ segment", () => {
      expect(real.pnl()).toBe("/api/v1/trading/info/real/pnl");
    });
  });

  describe("orderInfo (symmetric demo/real)", () => {
    it("returns demo path with /demo/ segment", () => {
      expect(demo.orderInfo("12345")).toBe(
        "/api/v1/trading/info/demo/orders/12345"
      );
    });

    it("returns real path with /real/ segment", () => {
      expect(real.orderInfo("12345")).toBe(
        "/api/v1/trading/info/real/orders/12345"
      );
    });

    it("accepts numeric orderId", () => {
      expect(demo.orderInfo(99)).toBe(
        "/api/v1/trading/info/demo/orders/99"
      );
    });
  });

  describe("tradeHistory (shared)", () => {
    it("returns same path for demo and real", () => {
      const expected = "/api/v1/trading/info/trade/history";
      expect(demo.tradeHistory()).toBe(expected);
      expect(real.tradeHistory()).toBe(expected);
    });
  });

  describe("marketData (no demo/real)", () => {
    it("returns market-data path", () => {
      expect(demo.marketData("search")).toBe("/api/v1/market-data/search");
      expect(real.marketData("instruments")).toBe(
        "/api/v1/market-data/instruments"
      );
    });
  });

  describe("social (no demo/real)", () => {
    it("returns user-info path", () => {
      expect(demo.social("people")).toBe("/api/v1/user-info/people");
      expect(real.social("people")).toBe("/api/v1/user-info/people");
    });
  });

  describe("watchlists", () => {
    it("returns base watchlists path without subpath", () => {
      expect(demo.watchlists()).toBe("/api/v1/watchlists");
    });

    it("returns watchlists path with subpath", () => {
      expect(demo.watchlists("123/items")).toBe(
        "/api/v1/watchlists/123/items"
      );
    });

    it("returns same path for demo and real", () => {
      expect(demo.watchlists()).toBe(real.watchlists());
    });
  });

  describe("feeds", () => {
    it("returns feeds path", () => {
      expect(demo.feeds("instrument/1")).toBe(
        "/api/v1/feeds/instrument/1"
      );
    });
  });

  describe("identity", () => {
    it("returns /api/v1/me", () => {
      expect(demo.identity()).toBe("/api/v1/me");
      expect(real.identity()).toBe("/api/v1/me");
    });
  });

  describe("discovery", () => {
    it("returns base path with subpath appended", () => {
      expect(demo.discovery("curated-lists")).toBe(
        "/api/v1/curated-lists"
      );
      expect(real.discovery("market-recommendations")).toBe(
        "/api/v1/market-recommendations"
      );
    });
  });

  describe("piData", () => {
    it("returns pi-data path", () => {
      expect(demo.piData("stats")).toBe("/api/v1/pi-data/stats");
    });
  });

  describe("agentPortfolios", () => {
    it("returns base path without subpath", () => {
      expect(demo.agentPortfolios()).toBe("/api/v1/agent-portfolios");
    });

    it("returns path with subpath", () => {
      expect(real.agentPortfolios("123")).toBe(
        "/api/v1/agent-portfolios/123"
      );
    });
  });

  describe("reactions", () => {
    it("returns reactions path", () => {
      expect(demo.reactions("like")).toBe("/api/v1/reactions/like");
    });
  });

  describe("environment type", () => {
    it("accepts 'demo' and 'real' as valid environments", () => {
      const envs: Environment[] = ["demo", "real"];
      envs.forEach((env) => {
        const resolver = createPathResolver(env);
        expect(resolver).toBeDefined();
      });
    });
  });
});
