import { describe, it, expect, vi } from "vitest";
import { registerSocialTools } from "../../../src/tools/social.js";
import { createMockServer, createMockClient, demoPaths } from "../../helpers/mock-mcp.js";

describe("search_people handler", () => {
  it("looks up users by usernames", async () => {
    const client = createMockClient({ get: vi.fn().mockResolvedValue({ items: [] }) });
    const { tool, handlers } = createMockServer();
    registerSocialTools(tool as any, client, demoPaths);

    await handlers.get("search_people")!({ action: "lookup", usernames: "trader1,trader2" });

    expect(client.get).toHaveBeenCalledWith(demoPaths.social("people"), { usernames: "trader1,trader2" });
  });

  it("rejects lookup with neither usernames nor cidList", async () => {
    const client = createMockClient();
    const { tool, handlers } = createMockServer();
    registerSocialTools(tool as any, client, demoPaths);

    const result = await handlers.get("search_people")!({ action: "lookup" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Either usernames or cidList is required for lookup");
  });

  it("runs a discovery search with filters", async () => {
    const client = createMockClient({ get: vi.fn().mockResolvedValue({ items: [] }) });
    const { tool, handlers } = createMockServer();
    registerSocialTools(tool as any, client, demoPaths);

    await handlers.get("search_people")!({
      action: "search",
      period: "CurrMonth",
      page: 1,
      pageSize: 20,
      isPopularInvestor: true,
      minGain: 5,
      maxRiskScore: 3,
      minCopiers: 100,
    });

    expect(client.get).toHaveBeenCalledWith(demoPaths.social("people/search"), {
      period: "CurrMonth",
      page: 1,
      pageSize: 20,
      isPopularInvestor: true,
      "dailyGain.Min": 5,
      "maxDailyRiskScore.Max": 3,
      "copiers.Min": 100,
    });
  });

  it("rejects search without a period", async () => {
    const client = createMockClient();
    const { tool, handlers } = createMockServer();
    registerSocialTools(tool as any, client, demoPaths);

    const result = await handlers.get("search_people")!({ action: "search" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("period is required for search (e.g. 'CurrMonth', 'CurrYear')");
  });

  it("returns errorContent when the client throws", async () => {
    const client = createMockClient({ get: vi.fn().mockRejectedValue(new Error("rate limited")) });
    const { tool, handlers } = createMockServer();
    registerSocialTools(tool as any, client, demoPaths);

    const result = await handlers.get("search_people")!({ action: "lookup", usernames: "trader1" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to search people: rate limited");
  });
});

describe("get_user_info handler", () => {
  const cases: Array<{ view: string; extra: Record<string, unknown>; expectPath: string; expectParams?: Record<string, unknown> }> = [
    { view: "portfolio", extra: { username: "trader1" }, expectPath: "people/trader1/portfolio/live" },
    { view: "tradeinfo", extra: { username: "trader1", period: "CurrYear" }, expectPath: "people/trader1/tradeinfo", expectParams: { period: "CurrYear" } },
    { view: "gain", extra: { username: "trader1" }, expectPath: "people/trader1/gain" },
    { view: "daily_gain", extra: { username: "trader1", minDate: "2026-01-01", maxDate: "2026-02-01", type: "Daily" }, expectPath: "people/trader1/daily-gain", expectParams: { minDate: "2026-01-01", maxDate: "2026-02-01", type: "Daily" } },
  ];

  for (const { view, extra, expectPath, expectParams } of cases) {
    it(`fetches the ${view} view`, async () => {
      const client = createMockClient({ get: vi.fn().mockResolvedValue({}) });
      const { tool, handlers } = createMockServer();
      registerSocialTools(tool as any, client, demoPaths);

      await handlers.get("get_user_info")!({ view, ...extra });

      if (expectParams) {
        expect(client.get).toHaveBeenCalledWith(demoPaths.social(expectPath), expectParams);
      } else {
        expect(client.get).toHaveBeenCalledWith(demoPaths.social(expectPath));
      }
    });

    it(`rejects the ${view} view without a username`, async () => {
      const client = createMockClient();
      const { tool, handlers } = createMockServer();
      registerSocialTools(tool as any, client, demoPaths);

      const { username: _drop, ...withoutUsername } = extra;
      const result = await handlers.get("get_user_info")!({ view, ...withoutUsername });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe(`username is required for ${view} view`);
    });
  }

  it("fetches copiers without requiring a username", async () => {
    const client = createMockClient({ get: vi.fn().mockResolvedValue({ copiers: [] }) });
    const { tool, handlers } = createMockServer();
    registerSocialTools(tool as any, client, demoPaths);

    await handlers.get("get_user_info")!({ view: "copiers" });

    expect(client.get).toHaveBeenCalledWith(demoPaths.piData("copiers"));
  });

  it("returns errorContent when the client throws", async () => {
    const client = createMockClient({ get: vi.fn().mockRejectedValue(new Error("404")) });
    const { tool, handlers } = createMockServer();
    registerSocialTools(tool as any, client, demoPaths);

    const result = await handlers.get("get_user_info")!({ view: "copiers" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to get user info: 404");
  });
});
