// tests/unit/server.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer } from "../../src/server.js";

const ALL_TOOL_NAMES = [
  "get_identity",
  "search_instruments", "get_instruments", "get_rates", "get_candles", "get_reference_data", "get_market_status",
  "open_order", "close_position", "manage_order",
  "get_portfolio", "get_trade_history",
  "search_people", "get_user_info",
  "manage_watchlists",
  "get_discovery",
  "get_feeds", "create_post",
  "manage_agent_portfolios",
];

describe("createServer", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.ETORO_API_KEY = "test-key";
    process.env.ETORO_USER_KEY = "test-user";
    process.env.ETORO_ENVIRONMENT = "demo";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("registers all 19 MCP tools exactly once", () => {
    const server = createServer();
    const registered = Object.keys((server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools);

    expect(registered.sort()).toEqual([...ALL_TOOL_NAMES].sort());
    expect(registered).toHaveLength(ALL_TOOL_NAMES.length);
  });
});
