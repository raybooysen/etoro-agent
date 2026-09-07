# Increase Unit Test Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise unit test coverage from the current ~35% (statements) to the ~80%+ level CLAUDE.md already claims is enforced, by adding handler-level tests for every MCP tool, the CLI, and `server.ts`, then actually enforcing a coverage threshold in CI.

**Architecture:** Every MCP tool file exports a `registerXxxTools(server, client, paths)` function that calls `server.tool(name, description, zodShape, handler)` one or more times. None of the `handler` callbacks are currently exercised by tests — only a handful of standalone pure helper functions (`flattenPnl`, `flattenPositions`, `lookupInstrumentId`, `flattenCandles`, `enrichWithNames`) are. The plan introduces one shared test helper that captures `handler` callbacks off a fake `McpServer`-shaped object and a fake `EtoroClient` (plain `vi.fn()`s for `get`/`post`/`put`/`patch`/`delete` — no fetch mocking needed), then uses it to drive every branch (success, validation-error, and best-effort-enrichment-failure paths) of every tool file. `cli.ts` gets the same treatment plus a small testability export so `main()` can be invoked from a test with a fake `EtoroClient` module and a stubbed `process.argv`. The plan ends by wiring a real `coverage.thresholds` block into `vitest.config.ts` so this doesn't regress silently again.

**Tech Stack:** Vitest 4 + `@vitest/coverage-v8`, `vi.fn()`/`vi.mock()` for mocking — no new dependencies.

**Spec:** This plan's own analysis (below) is the spec; there is no separate design doc.

## Analysis (current state)

Coverage from `npm run test:coverage` today:

| File | Stmts | Notes |
|---|---|---|
| `src/cli.ts` | 0% | Entire 568-line file untested |
| `src/server.ts` | 0% | Tool wiring untested |
| `src/tools/identity.ts` | 0% | |
| `src/tools/discovery.ts` | 0% | |
| `src/tools/feeds.ts` | 0% | |
| `src/tools/social.ts` | 0% | |
| `src/tools/watchlists.ts` | 0% | Existing `watchlists.test.ts` only tests `EtoroClient` + `PathResolver` directly, never the `manage_watchlists` handler |
| `src/tools/agent-portfolios.ts` | 0% | |
| `src/tools/trading.ts` | 21.8% | Only `lookupInstrumentId` is tested; `open_order`/`close_position`/`manage_order` handlers (real trading logic) are untested |
| `src/tools/portfolio.ts` | 48.7% | Pure flatten/extract helpers tested; `get_portfolio`/`get_trade_history` handlers (enrichment, view dispatch) are not |
| `src/tools/market-data.ts` | 49.7% | Pure helpers tested; all 6 `server.tool(...)` handlers are not |
| `src/client.ts` | 93.5% | Minor gaps: `getRateLimitStatus()`, verbose logging branch |
| `src/config.ts` | 95.7% | Minor gap: non-`ZodError` rethrow branch |
| `src/utils/rate-limiter.ts` | 100%/94.1% branch | Missing: `waitMs <= 0` branch |
| `src/utils/table-formatter.ts` | 93.3% | Missing: >15-column bail-out, non-array/empty input |
| **Overall** | **35.4%** | |

Also: `vitest.config.ts` defines `coverage` reporting but **no `thresholds`** — CLAUDE.md's claim of an "80% coverage threshold enforced" is not actually true today (nothing fails the build on low coverage). Task 15 fixes this once the number is real.

Root cause of the gap: every tool file follows the same shape (`server.tool(name, desc, schema, async (args) => {...})`), and no test in the repo has ever captured and invoked one of those `async` handlers directly — tests either exercise pure helper functions or the `EtoroClient`/`PathResolver` layer underneath. This plan closes that one structural gap, file by file.

## Global Constraints

- Node.js >=22 (repo floor; no version-specific test code).
- No new npm dependencies — use `vitest`'s built-in `vi.fn()`/`vi.mock()`.
- Tests must never hit the network. Tool-handler tests mock `EtoroClient` itself (plain `vi.fn()` per method); do not mock `fetch` for these (that pattern is reserved for `client.test.ts`, which tests `EtoroClient` itself).
- Because production code already exists and is presumed correct, the cycle per test is: write test → run → **expect PASS**. If a test fails against existing code, that is a real bug — stop and report it in the task's commit message / PR description rather than silently editing the test to match broken behavior.
- Match existing conventions: `describe`/`it` from `vitest`, `.js` import extensions (NodeNext), camelCase API response fixtures with an occasional PascalCase variant test (existing tests already do this — follow the same pattern).
- New test files live under `tests/unit/tools/`, `tests/unit/`, or `tests/helpers/` to mirror `src/`.
- Do not change any production *behavior*. The only production-code edits in this plan are in Task 13 (exporting `main` and pure helpers from `cli.ts` for testability) and Task 15 (adding coverage thresholds to `vitest.config.ts`) — both are additive/config-only.
- Every task must leave `npm run build`, `npm test`, and `npm run lint` passing.

---

## Task 1: Shared MCP test helper

**Files:**
- Create: `tests/helpers/mock-mcp.ts`
- Test: none (this is a test helper, exercised indirectly by every later task — Task 2 is its first consumer and proves it works)

**Interfaces:**
- Produces:
  - `createMockServer(): { tool: Mock; handlers: Map<string, (args: any) => Promise<unknown>> }` — a fake `McpServer` whose `.tool(name, description, schema, handler)` calls are captured into `handlers`, keyed by tool name.
  - `createMockClient(overrides?: Partial<Record<"get"|"post"|"put"|"patch"|"delete", ReturnType<typeof vi.fn>>>): EtoroClient` — a fake `EtoroClient` with all five HTTP methods as `vi.fn()`, overridable per test.
  - `demoPaths: PathResolver` and `realPaths: PathResolver` — ready-made path resolvers for demo/real, so tests don't need to call `createPathResolver` themselves.

- [ ] **Step 1: Write the helper**

```typescript
// tests/helpers/mock-mcp.ts
import { vi } from "vitest";
import type { EtoroClient } from "../../src/client.js";
import { createPathResolver } from "../../src/utils/path-resolver.js";

type ToolHandler = (args: any) => Promise<unknown>;

export interface MockServer {
  tool: ReturnType<typeof vi.fn>;
  handlers: Map<string, ToolHandler>;
}

/**
 * A fake McpServer that captures every `server.tool(name, description, schema, handler)`
 * call so tests can invoke the handler directly, without spinning up a real MCP transport.
 */
export function createMockServer(): MockServer {
  const handlers = new Map<string, ToolHandler>();
  const tool = vi.fn(
    (name: string, _description: string, _schema: unknown, handler: ToolHandler) => {
      handlers.set(name, handler);
    },
  );
  return { tool, handlers } as unknown as MockServer;
}

type ClientMethod = "get" | "post" | "put" | "patch" | "delete";

/** A fake EtoroClient with all HTTP verbs stubbed as vi.fn(). Pass overrides to set return values. */
export function createMockClient(
  overrides: Partial<Record<ClientMethod, ReturnType<typeof vi.fn>>> = {},
): EtoroClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  } as unknown as EtoroClient;
}

export const demoPaths = createPathResolver("demo");
export const realPaths = createPathResolver("real");
```

- [ ] **Step 2: Verify it compiles and lints**

Run: `npm run build && npm run lint`
Expected: both pass with no errors (this file has no test to run yet — Task 2 proves it works end to end).

- [ ] **Step 3: Commit**

```bash
git add tests/helpers/mock-mcp.ts
git commit -m "test: add shared MCP server/client mock helper"
```

---

## Task 2: `identity.ts` full coverage

**Files:**
- Create: `tests/unit/tools/identity.test.ts`

**Interfaces:**
- Consumes: `createMockServer`, `createMockClient`, `demoPaths` from `tests/helpers/mock-mcp.ts` (Task 1); `registerIdentityTools` from `src/tools/identity.ts`.

- [ ] **Step 1: Write the tests**

```typescript
// tests/unit/tools/identity.test.ts
import { describe, it, expect } from "vitest";
import { registerIdentityTools } from "../../../src/tools/identity.js";
import { createMockServer, createMockClient, demoPaths } from "../../helpers/mock-mcp.js";

describe("get_identity handler", () => {
  it("returns the client's identity as JSON content", async () => {
    const client = createMockClient({
      get: vi.fn().mockResolvedValue({ username: "trader1", cid: 12345 }),
    });
    const { tool, handlers } = createMockServer();
    registerIdentityTools(tool as any, client, demoPaths);

    const handler = handlers.get("get_identity")!;
    const result = await handler({});

    expect(client.get).toHaveBeenCalledWith(demoPaths.identity());
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toEqual({ username: "trader1", cid: 12345 });
  });

  it("returns errorContent when the client throws", async () => {
    const client = createMockClient({
      get: vi.fn().mockRejectedValue(new Error("401 Unauthorized")),
    });
    const { tool, handlers } = createMockServer();
    registerIdentityTools(tool as any, client, demoPaths);

    const result = await handlers.get("get_identity")!({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to get identity: 401 Unauthorized");
  });
});
```

Note: add `import { vi } from "vitest";` alongside the other vitest imports.

- [ ] **Step 2: Run the tests**

Run: `npx vitest run tests/unit/tools/identity.test.ts`
Expected: 2 passed. If either fails, `mock-mcp.ts` is miswired — fix the helper (Task 1), not the tool code.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/tools/identity.test.ts
git commit -m "test: cover get_identity handler (success + error paths)"
```

---

## Task 3: `discovery.ts` full coverage

**Files:**
- Create: `tests/unit/tools/discovery.test.ts`

**Interfaces:**
- Consumes: same helpers as Task 2; `registerDiscoveryTools` from `src/tools/discovery.ts`.

- [ ] **Step 1: Write the tests**

```typescript
// tests/unit/tools/discovery.test.ts
import { describe, it, expect, vi } from "vitest";
import { registerDiscoveryTools } from "../../../src/tools/discovery.js";
import { createMockServer, createMockClient, demoPaths } from "../../helpers/mock-mcp.js";

describe("get_discovery handler", () => {
  it("fetches curated lists when type is curated_lists", async () => {
    const client = createMockClient({ get: vi.fn().mockResolvedValue([{ id: "top-movers" }]) });
    const { tool, handlers } = createMockServer();
    registerDiscoveryTools(tool as any, client, demoPaths);

    const result = await handlers.get("get_discovery")!({ type: "curated_lists", count: 10 });

    expect(client.get).toHaveBeenCalledWith(demoPaths.discovery("curated-lists"));
    expect(JSON.parse(result.content[0].text)).toEqual([{ id: "top-movers" }]);
  });

  it("defaults curated_lists to [] when the API returns null", async () => {
    const client = createMockClient({ get: vi.fn().mockResolvedValue(null) });
    const { tool, handlers } = createMockServer();
    registerDiscoveryTools(tool as any, client, demoPaths);

    const result = await handlers.get("get_discovery")!({ type: "curated_lists", count: 10 });

    expect(JSON.parse(result.content[0].text)).toEqual([]);
  });

  it("fetches recommendations with the requested count", async () => {
    const client = createMockClient({ get: vi.fn().mockResolvedValue({ recommendations: [{ id: 1 }] }) });
    const { tool, handlers } = createMockServer();
    registerDiscoveryTools(tool as any, client, demoPaths);

    const result = await handlers.get("get_discovery")!({ type: "recommendations", count: 5 });

    expect(client.get).toHaveBeenCalledWith(demoPaths.discovery("market-recommendations/5"));
    expect(JSON.parse(result.content[0].text)).toEqual({ recommendations: [{ id: 1 }] });
  });

  it("returns a friendly empty message when recommendations are unavailable", async () => {
    const client = createMockClient({ get: vi.fn().mockResolvedValue(undefined) });
    const { tool, handlers } = createMockServer();
    registerDiscoveryTools(tool as any, client, demoPaths);

    const result = await handlers.get("get_discovery")!({ type: "recommendations", count: 5 });

    expect(JSON.parse(result.content[0].text)).toEqual({
      recommendations: [],
      message: "No recommendations available for this account.",
    });
  });

  it("returns errorContent when the client throws", async () => {
    const client = createMockClient({ get: vi.fn().mockRejectedValue(new Error("boom")) });
    const { tool, handlers } = createMockServer();
    registerDiscoveryTools(tool as any, client, demoPaths);

    const result = await handlers.get("get_discovery")!({ type: "curated_lists", count: 10 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to get discovery data: boom");
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run tests/unit/tools/discovery.test.ts`
Expected: 5 passed.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/tools/discovery.test.ts
git commit -m "test: cover get_discovery handler (all branches)"
```

---

## Task 4: `feeds.ts` full coverage

**Files:**
- Create: `tests/unit/tools/feeds.test.ts`

**Interfaces:**
- Consumes: same helpers; `registerFeedTools` from `src/tools/feeds.ts`.

- [ ] **Step 1: Write the tests**

```typescript
// tests/unit/tools/feeds.test.ts
import { describe, it, expect, vi } from "vitest";
import { registerFeedTools } from "../../../src/tools/feeds.js";
import { createMockServer, createMockClient, demoPaths } from "../../helpers/mock-mcp.js";

describe("get_feeds handler", () => {
  it("fetches feed posts for an instrument with pagination params", async () => {
    const client = createMockClient({ get: vi.fn().mockResolvedValue({ items: [] }) });
    const { tool, handlers } = createMockServer();
    registerFeedTools(tool as any, client, demoPaths);

    await handlers.get("get_feeds")!({ type: "instrument", id: "18", take: 20, offset: 0 });

    expect(client.get).toHaveBeenCalledWith(demoPaths.feeds("instrument/18"), { take: 20, offset: 0 });
  });

  it("returns errorContent when the client throws", async () => {
    const client = createMockClient({ get: vi.fn().mockRejectedValue(new Error("timeout")) });
    const { tool, handlers } = createMockServer();
    registerFeedTools(tool as any, client, demoPaths);

    const result = await handlers.get("get_feeds")!({ type: "user", id: "5", take: 20, offset: 0 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to get feeds: timeout");
  });
});

describe("create_post handler", () => {
  it("creates a post with tags and mentions", async () => {
    const client = createMockClient({ post: vi.fn().mockResolvedValue({ id: "post-1" }) });
    const { tool, handlers } = createMockServer();
    registerFeedTools(tool as any, client, demoPaths);

    const result = await handlers.get("create_post")!({
      action: "post",
      message: "Bought some AAPL",
      owner: 42,
      tags: ["AAPL"],
      mentions: [7],
    });

    expect(client.post).toHaveBeenCalledWith(demoPaths.feeds("post"), {
      message: "Bought some AAPL",
      owner: 42,
      tags: ["AAPL"],
      mentions: [7],
    });
    expect(JSON.parse(result.content[0].text)).toEqual({ id: "post-1" });
  });

  it("rejects a post without an owner", async () => {
    const client = createMockClient();
    const { tool, handlers } = createMockServer();
    registerFeedTools(tool as any, client, demoPaths);

    const result = await handlers.get("create_post")!({ action: "post", message: "hi" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("owner is required for creating a post");
    expect(client.post).not.toHaveBeenCalled();
  });

  it("creates a comment on a post", async () => {
    const client = createMockClient({ post: vi.fn().mockResolvedValue({ id: "comment-1" }) });
    const { tool, handlers } = createMockServer();
    registerFeedTools(tool as any, client, demoPaths);

    await handlers.get("create_post")!({ action: "comment", message: "nice trade", postId: "post-1" });

    expect(client.post).toHaveBeenCalledWith(demoPaths.reactions("post-1/comment"), { message: "nice trade" });
  });

  it("rejects a comment without a postId", async () => {
    const client = createMockClient();
    const { tool, handlers } = createMockServer();
    registerFeedTools(tool as any, client, demoPaths);

    const result = await handlers.get("create_post")!({ action: "comment", message: "nice trade" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("postId is required for commenting");
  });

  it("returns errorContent when the client throws", async () => {
    const client = createMockClient({ post: vi.fn().mockRejectedValue(new Error("500")) });
    const { tool, handlers } = createMockServer();
    registerFeedTools(tool as any, client, demoPaths);

    const result = await handlers.get("create_post")!({ action: "post", message: "hi", owner: 1 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to create post: 500");
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run tests/unit/tools/feeds.test.ts`
Expected: 7 passed.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/tools/feeds.test.ts
git commit -m "test: cover get_feeds and create_post handlers (all branches)"
```

---

## Task 5: `social.ts` full coverage

**Files:**
- Create: `tests/unit/tools/social.test.ts`

**Interfaces:**
- Consumes: same helpers; `registerSocialTools` from `src/tools/social.ts`.

- [ ] **Step 1: Write the tests**

```typescript
// tests/unit/tools/social.test.ts
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
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run tests/unit/tools/social.test.ts`
Expected: 14 passed (5 + 4 views × 2 + 1 copiers + 1 error).

- [ ] **Step 3: Commit**

```bash
git add tests/unit/tools/social.test.ts
git commit -m "test: cover search_people and get_user_info handlers (all branches)"
```

---

## Task 6: `agent-portfolios.ts` full coverage

**Files:**
- Create: `tests/unit/tools/agent-portfolios.test.ts`

**Interfaces:**
- Consumes: same helpers; `registerAgentPortfolioTools` from `src/tools/agent-portfolios.ts`.

- [ ] **Step 1: Write the tests**

```typescript
// tests/unit/tools/agent-portfolios.test.ts
import { describe, it, expect, vi } from "vitest";
import { registerAgentPortfolioTools } from "../../../src/tools/agent-portfolios.js";
import { createMockServer, createMockClient, demoPaths } from "../../helpers/mock-mcp.js";

function setup() {
  const client = createMockClient({
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    patch: vi.fn().mockResolvedValue({}),
  });
  const { tool, handlers } = createMockServer();
  registerAgentPortfolioTools(tool as any, client, demoPaths);
  return { client, handler: handlers.get("manage_agent_portfolios")! };
}

describe("manage_agent_portfolios handler", () => {
  it("list", async () => {
    const { client, handler } = setup();
    await handler({ action: "list" });
    expect(client.get).toHaveBeenCalledWith(demoPaths.agentPortfolios());
  });

  it("create with name and description", async () => {
    const { client, handler } = setup();
    await handler({ action: "create", name: "Momentum Bot", description: "trend follower" });
    expect(client.post).toHaveBeenCalledWith(demoPaths.agentPortfolios(), {
      name: "Momentum Bot",
      description: "trend follower",
    });
  });

  it("rejects create without a name", async () => {
    const { client, handler } = setup();
    const result = await handler({ action: "create" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("name is required for create");
    expect(client.post).not.toHaveBeenCalled();
  });

  it("delete", async () => {
    const { client, handler } = setup();
    await handler({ action: "delete", agentPortfolioId: "pf-1" });
    expect(client.delete).toHaveBeenCalledWith(demoPaths.agentPortfolios("pf-1"));
  });

  it("rejects delete without agentPortfolioId", async () => {
    const { handler } = setup();
    const result = await handler({ action: "delete" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("agentPortfolioId is required");
  });

  it("create_token with settings JSON", async () => {
    const { client, handler } = setup();
    await handler({ action: "create_token", agentPortfolioId: "pf-1", tokenSettings: '{"scope":"read"}' });
    expect(client.post).toHaveBeenCalledWith(demoPaths.agentPortfolios("pf-1/user-tokens"), { scope: "read" });
  });

  it("create_token without settings defaults to {}", async () => {
    const { client, handler } = setup();
    await handler({ action: "create_token", agentPortfolioId: "pf-1" });
    expect(client.post).toHaveBeenCalledWith(demoPaths.agentPortfolios("pf-1/user-tokens"), {});
  });

  it("rejects create_token without agentPortfolioId", async () => {
    const { handler } = setup();
    const result = await handler({ action: "create_token" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("agentPortfolioId is required");
  });

  it("revoke_token", async () => {
    const { client, handler } = setup();
    await handler({ action: "revoke_token", agentPortfolioId: "pf-1", userTokenId: "tok-1" });
    expect(client.delete).toHaveBeenCalledWith(demoPaths.agentPortfolios("pf-1/user-tokens/tok-1"));
  });

  it("rejects revoke_token missing either id", async () => {
    const { handler } = setup();
    const result = await handler({ action: "revoke_token", agentPortfolioId: "pf-1" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("agentPortfolioId and userTokenId are required");
  });

  it("update_token with settings JSON", async () => {
    const { client, handler } = setup();
    await handler({ action: "update_token", agentPortfolioId: "pf-1", userTokenId: "tok-1", tokenSettings: '{"scope":"write"}' });
    expect(client.patch).toHaveBeenCalledWith(demoPaths.agentPortfolios("pf-1/user-tokens/tok-1"), { scope: "write" });
  });

  it("rejects update_token missing either id", async () => {
    const { handler } = setup();
    const result = await handler({ action: "update_token", userTokenId: "tok-1" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("agentPortfolioId and userTokenId are required");
  });

  it("returns errorContent when the client throws", async () => {
    const client = createMockClient({ get: vi.fn().mockRejectedValue(new Error("503")) });
    const { tool, handlers } = createMockServer();
    registerAgentPortfolioTools(tool as any, client, demoPaths);

    const result = await handlers.get("manage_agent_portfolios")!({ action: "list" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to manage agent portfolio: 503");
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run tests/unit/tools/agent-portfolios.test.ts`
Expected: 13 passed.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/tools/agent-portfolios.test.ts
git commit -m "test: cover manage_agent_portfolios handler (all 6 actions + validation)"
```

---

## Task 7: `watchlists.ts` handler coverage

**Files:**
- Modify: `tests/unit/tools/watchlists.test.ts` (append a new `describe` block — the existing "watchlist API calls" block testing raw `EtoroClient` + `PathResolver` stays as-is)

**Interfaces:**
- Consumes: same helpers; `registerWatchlistTools` from `src/tools/watchlists.ts`. The file already imports `EtoroClient` and `createPathResolver` — add the new imports alongside them.

- [ ] **Step 1: Append the handler tests**

Add these imports to the top of the existing file (next to the current ones):

```typescript
import { registerWatchlistTools } from "../../../src/tools/watchlists.js";
import { createMockServer, createMockClient } from "../../helpers/mock-mcp.js";
```

Append at the end of the file:

```typescript
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
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run tests/unit/tools/watchlists.test.ts`
Expected: all previous tests plus 25 new ones pass.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/tools/watchlists.test.ts
git commit -m "test: cover manage_watchlists handler (all 14 actions + validation)"
```

---

## Task 8: `trading.ts` handler coverage (highest priority — real trading logic)

**Files:**
- Modify: `tests/unit/tools/trading.test.ts` (append below the existing `lookupInstrumentId` tests)

**Interfaces:**
- Consumes: same helpers; `registerTradingTools` from `src/tools/trading.js` (already imports `lookupInstrumentId` from the same module — add `registerTradingTools` to that import).

- [ ] **Step 1: Append the handler tests**

Change the top import line from:
```typescript
import { lookupInstrumentId } from "../../../src/tools/trading.js";
```
to:
```typescript
import { lookupInstrumentId, registerTradingTools } from "../../../src/tools/trading.js";
import { createMockServer, createMockClient, demoPaths } from "../../helpers/mock-mcp.js";
```

Append at the end of the file:

```typescript
function setupTrading() {
  const client = createMockClient({
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  });
  const { tool, handlers } = createMockServer();
  registerTradingTools(tool as any, client, demoPaths);
  return { client, handlers };
}

describe("open_order handler", () => {
  it("opens a by_amount order", async () => {
    const { client, handlers } = setupTrading();
    await handlers.get("open_order")!({
      order_type: "by_amount", InstrumentID: 1, IsBuy: true, Leverage: 1, Amount: 100,
    });
    expect(client.post).toHaveBeenCalledWith(demoPaths.trading("market-open-orders/by-amount"), {
      InstrumentID: 1, IsBuy: true, Leverage: 1, Amount: 100,
    });
  });

  it("rejects by_amount without Amount", async () => {
    const { client, handlers } = setupTrading();
    const result = await handlers.get("open_order")!({
      order_type: "by_amount", InstrumentID: 1, IsBuy: true, Leverage: 1,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Amount is required for order_type 'by_amount'");
    expect(client.post).not.toHaveBeenCalled();
  });

  it("opens a by_units order", async () => {
    const { client, handlers } = setupTrading();
    await handlers.get("open_order")!({
      order_type: "by_units", InstrumentID: 1, IsBuy: false, Leverage: 2, AmountInUnits: 10,
    });
    expect(client.post).toHaveBeenCalledWith(demoPaths.trading("market-open-orders/by-units"), {
      InstrumentID: 1, IsBuy: false, Leverage: 2, AmountInUnits: 10,
    });
  });

  it("rejects by_units without AmountInUnits", async () => {
    const { handlers } = setupTrading();
    const result = await handlers.get("open_order")!({
      order_type: "by_units", InstrumentID: 1, IsBuy: false, Leverage: 2,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("AmountInUnits is required for order_type 'by_units'");
  });

  it("returns errorContent when the client throws", async () => {
    const client = createMockClient({ post: vi.fn().mockRejectedValue(new Error("insufficient funds")) });
    const { tool, handlers } = createMockServer();
    registerTradingTools(tool as any, client, demoPaths);

    const result = await handlers.get("open_order")!({
      order_type: "by_amount", InstrumentID: 1, IsBuy: true, Leverage: 1, Amount: 100,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to open order: insufficient funds");
  });
});

describe("close_position handler", () => {
  it("closes using an explicitly provided InstrumentID", async () => {
    const { client, handlers } = setupTrading();
    await handlers.get("close_position")!({ positionId: 100, InstrumentID: 18 });
    expect(client.get).not.toHaveBeenCalled();
    expect(client.post).toHaveBeenCalledWith(demoPaths.trading("market-close-orders/positions/100"), { InstrumentID: 18 });
  });

  it("auto-looks-up InstrumentID from the portfolio when not provided", async () => {
    const client = createMockClient({
      get: vi.fn().mockResolvedValue({ positions: [{ positionID: 100, instrumentID: 18 }] }),
      post: vi.fn().mockResolvedValue({}),
    });
    const { tool, handlers } = createMockServer();
    registerTradingTools(tool as any, client, demoPaths);

    await handlers.get("close_position")!({ positionId: 100 });

    expect(client.get).toHaveBeenCalledWith(demoPaths.portfolio());
    expect(client.post).toHaveBeenCalledWith(demoPaths.trading("market-close-orders/positions/100"), { InstrumentID: 18 });
  });

  it("errors when auto-lookup can't find the position", async () => {
    const client = createMockClient({ get: vi.fn().mockResolvedValue({ positions: [] }) });
    const { tool, handlers } = createMockServer();
    registerTradingTools(tool as any, client, demoPaths);

    const result = await handlers.get("close_position")!({ positionId: 999 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Could not find position 999 in portfolio. Provide InstrumentID explicitly.");
  });

  it("includes UnitsToDeduct for a partial close", async () => {
    const { client, handlers } = setupTrading();
    await handlers.get("close_position")!({ positionId: 100, InstrumentID: 18, UnitsToDeduct: 5 });
    expect(client.post).toHaveBeenCalledWith(demoPaths.trading("market-close-orders/positions/100"), {
      InstrumentID: 18, UnitsToDeduct: 5,
    });
  });

  it("returns errorContent when the client throws", async () => {
    const client = createMockClient({ post: vi.fn().mockRejectedValue(new Error("position already closed")) });
    const { tool, handlers } = createMockServer();
    registerTradingTools(tool as any, client, demoPaths);

    const result = await handlers.get("close_position")!({ positionId: 100, InstrumentID: 18 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to close position: position already closed");
  });
});

describe("manage_order handler", () => {
  it("cancel_open_order", async () => {
    const { client, handlers } = setupTrading();
    await handlers.get("manage_order")!({ action: "cancel_open_order", orderId: 5 });
    expect(client.delete).toHaveBeenCalledWith(demoPaths.trading("market-open-orders/5"));
  });

  it("rejects cancel_open_order without orderId", async () => {
    const { handlers } = setupTrading();
    const result = await handlers.get("manage_order")!({ action: "cancel_open_order" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("orderId is required for cancel_open_order");
  });

  it("cancel_close_order", async () => {
    const { client, handlers } = setupTrading();
    await handlers.get("manage_order")!({ action: "cancel_close_order", orderId: 6 });
    expect(client.delete).toHaveBeenCalledWith(demoPaths.trading("market-close-orders/6"));
  });

  it("rejects cancel_close_order without orderId", async () => {
    const { handlers } = setupTrading();
    const result = await handlers.get("manage_order")!({ action: "cancel_close_order" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("orderId is required for cancel_close_order");
  });

  it("place_limit_order with all optional fields", async () => {
    const { client, handlers } = setupTrading();
    await handlers.get("manage_order")!({
      action: "place_limit_order", InstrumentID: 1, IsBuy: true, Leverage: 1, Rate: 150,
      Amount: 100, StopLossRate: 140, TakeProfitRate: 160, IsTslEnabled: true,
      IsNoStopLoss: false, IsNoTakeProfit: false,
    });
    expect(client.post).toHaveBeenCalledWith(demoPaths.trading("limit-orders"), {
      InstrumentID: 1, IsBuy: true, Leverage: 1, Rate: 150,
      Amount: 100, StopLossRate: 140, TakeProfitRate: 160, IsTslEnabled: true,
      IsNoStopLoss: false, IsNoTakeProfit: false,
    });
  });

  it("place_limit_order with only the required fields", async () => {
    const { client, handlers } = setupTrading();
    await handlers.get("manage_order")!({ action: "place_limit_order", InstrumentID: 1, IsBuy: true, Leverage: 1, Rate: 150 });
    expect(client.post).toHaveBeenCalledWith(demoPaths.trading("limit-orders"), {
      InstrumentID: 1, IsBuy: true, Leverage: 1, Rate: 150,
    });
  });

  it("rejects place_limit_order missing required fields", async () => {
    const { handlers } = setupTrading();
    const result = await handlers.get("manage_order")!({ action: "place_limit_order", InstrumentID: 1, IsBuy: true });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("InstrumentID, IsBuy, Leverage, and Rate are required for place_limit_order");
  });

  it("cancel_limit_order", async () => {
    const { client, handlers } = setupTrading();
    await handlers.get("manage_order")!({ action: "cancel_limit_order", orderId: 7 });
    expect(client.delete).toHaveBeenCalledWith(demoPaths.trading("limit-orders/7"));
  });

  it("rejects cancel_limit_order without orderId", async () => {
    const { handlers } = setupTrading();
    const result = await handlers.get("manage_order")!({ action: "cancel_limit_order" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("orderId is required for cancel_limit_order");
  });

  it("returns errorContent when the client throws", async () => {
    const client = createMockClient({ delete: vi.fn().mockRejectedValue(new Error("order not found")) });
    const { tool, handlers } = createMockServer();
    registerTradingTools(tool as any, client, demoPaths);

    const result = await handlers.get("manage_order")!({ action: "cancel_open_order", orderId: 5 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to manage order: order not found");
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run tests/unit/tools/trading.test.ts`
Expected: all previous `lookupInstrumentId` tests plus 20 new ones pass.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/tools/trading.test.ts
git commit -m "test: cover open_order/close_position/manage_order handlers (all branches)"
```

---

## Task 9: `portfolio.ts` handler coverage

**Files:**
- Modify: `tests/unit/tools/portfolio.test.ts` (append below the existing helper-function tests)

**Interfaces:**
- Consumes: same helpers; `registerPortfolioTools` from `src/tools/portfolio.js` (add to the existing import line from that module).

- [ ] **Step 1: Append the handler tests**

Add to the top imports:
```typescript
import { registerPortfolioTools } from "../../../src/tools/portfolio.js";
import { createMockServer, createMockClient, demoPaths } from "../../helpers/mock-mcp.js";
```

Append at the end of the file:

```typescript
function setupPortfolio(overrides: Parameters<typeof createMockClient>[0] = {}) {
  const client = createMockClient({ get: vi.fn().mockResolvedValue({}), ...overrides });
  const { tool, handlers } = createMockServer();
  registerPortfolioTools(tool as any, client, demoPaths);
  return { client, handler: handlers.get("get_portfolio")! };
}

describe("get_portfolio handler", () => {
  it("positions view flattens and enriches positions", async () => {
    const { client, handler } = setupPortfolio({
      get: vi.fn()
        .mockResolvedValueOnce({ clientPortfolio: { positions: [{ positionID: 1, instrumentID: 18, amount: 100 }] } })
        .mockResolvedValueOnce({ instrumentDisplayDatas: [{ instrumentID: 18, instrumentDisplayName: "Apple", symbolFull: "AAPL" }] }),
    });

    const result = await handler({ view: "positions" });

    expect(client.get).toHaveBeenNthCalledWith(1, demoPaths.portfolio());
    const positions = JSON.parse(result.content[0].text);
    expect(positions[0]).toMatchObject({ positionID: 1, instrumentDisplayName: "Apple", symbolFull: "AAPL" });
  });

  it("positions view returns unenriched positions if enrichment fails", async () => {
    const { handler } = setupPortfolio({
      get: vi.fn()
        .mockResolvedValueOnce({ clientPortfolio: { positions: [{ positionID: 1, instrumentID: 18 }] } })
        .mockRejectedValueOnce(new Error("lookup failed")),
    });

    const result = await handler({ view: "positions" });

    const positions = JSON.parse(result.content[0].text);
    expect(positions[0]).toMatchObject({ positionID: 1, instrumentID: 18 });
  });

  it("pnl view flattens and enriches nested positions", async () => {
    const { client, handler } = setupPortfolio({
      get: vi.fn()
        .mockResolvedValueOnce({ clientPortfolio: { credit: 1000, unrealizedPnL: 50, positions: [{ positionID: 1, instrumentID: 18 }] } })
        .mockResolvedValueOnce({ instrumentDisplayDatas: [{ instrumentID: 18, instrumentDisplayName: "Apple", symbolFull: "AAPL" }] }),
    });

    const result = await handler({ view: "pnl" });

    expect(client.get).toHaveBeenNthCalledWith(1, demoPaths.pnl());
    const pnl = JSON.parse(result.content[0].text);
    expect(pnl.TotalEquity).toBe(1050);
    expect(pnl.positions[0]).toMatchObject({ instrumentDisplayName: "Apple" });
  });

  it("order view fetches order info by ID", async () => {
    const { client, handler } = setupPortfolio({ get: vi.fn().mockResolvedValue({ status: "Filled" }) });

    const result = await handler({ view: "order", orderId: 42 });

    expect(client.get).toHaveBeenCalledWith(demoPaths.orderInfo(42));
    expect(JSON.parse(result.content[0].text)).toEqual({ status: "Filled" });
  });

  it("rejects order view without orderId", async () => {
    const { handler } = setupPortfolio();
    const result = await handler({ view: "order" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("orderId is required when view is 'order'");
  });

  it("returns errorContent when the client throws", async () => {
    const { handler } = setupPortfolio({ get: vi.fn().mockRejectedValue(new Error("500")) });
    const result = await handler({ view: "positions" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to get portfolio: 500");
  });
});

describe("get_trade_history handler", () => {
  function setupHistory(overrides: Parameters<typeof createMockClient>[0] = {}) {
    const client = createMockClient({ get: vi.fn().mockResolvedValue({}), ...overrides });
    const { tool, handlers } = createMockServer();
    registerPortfolioTools(tool as any, client, demoPaths);
    return { client, handler: handlers.get("get_trade_history")! };
  }

  it("fetches trade history without enrichment by default", async () => {
    const { client, handler } = setupHistory({ get: vi.fn().mockResolvedValue({ items: [] }) });
    await handler({ minDate: "2026-01-01" });
    expect(client.get).toHaveBeenCalledWith(demoPaths.tradeHistory(), { minDate: "2026-01-01" });
  });

  it("passes through page and pageSize when provided", async () => {
    const { client, handler } = setupHistory({ get: vi.fn().mockResolvedValue({ items: [] }) });
    await handler({ minDate: "2026-01-01", page: 2, pageSize: 10 });
    expect(client.get).toHaveBeenCalledWith(demoPaths.tradeHistory(), { minDate: "2026-01-01", page: 2, pageSize: 10 });
  });

  it("enriches trade history items and re-wraps them under the original wrapper key", async () => {
    const { handler } = setupHistory({
      get: vi.fn()
        .mockResolvedValueOnce({ items: [{ instrumentID: 18 }] })
        .mockResolvedValueOnce({ instrumentDisplayDatas: [{ instrumentID: 18, instrumentDisplayName: "Apple", symbolFull: "AAPL" }] }),
    });

    const result = await handler({ minDate: "2026-01-01", includeNames: true });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.items[0]).toMatchObject({ instrumentDisplayName: "Apple" });
  });

  it("returns raw result unchanged if there are no items to enrich", async () => {
    const { handler } = setupHistory({ get: vi.fn().mockResolvedValue({ items: [] }) });
    const result = await handler({ minDate: "2026-01-01", includeNames: true });
    expect(JSON.parse(result.content[0].text)).toEqual({ items: [] });
  });

  it("falls back to the unenriched result if enrichment fails", async () => {
    const { handler } = setupHistory({
      get: vi.fn()
        .mockResolvedValueOnce({ items: [{ instrumentID: 18 }] })
        .mockRejectedValueOnce(new Error("enrich failed")),
    });
    const result = await handler({ minDate: "2026-01-01", includeNames: true });
    expect(JSON.parse(result.content[0].text)).toEqual({ items: [{ instrumentID: 18 }] });
  });

  it("returns errorContent when the client throws", async () => {
    const { handler } = setupHistory({ get: vi.fn().mockRejectedValue(new Error("400")) });
    const result = await handler({ minDate: "2026-01-01" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to get trade history: 400");
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run tests/unit/tools/portfolio.test.ts`
Expected: all previous tests plus 13 new ones pass.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/tools/portfolio.test.ts
git commit -m "test: cover get_portfolio and get_trade_history handlers (all branches)"
```

---

## Task 10: `market-data.ts` handler coverage

**Files:**
- Modify: `tests/unit/tools/market-data.test.ts` (append below the existing helper-function tests)

**Interfaces:**
- Consumes: same helpers; `registerMarketDataTools` from `src/tools/market-data.js` (add to the existing import line from that module).

- [ ] **Step 1: Append the handler tests**

Add to the top imports:
```typescript
import { registerMarketDataTools } from "../../../src/tools/market-data.js";
import { createMockServer, createMockClient, demoPaths } from "../../helpers/mock-mcp.js";
```

Append at the end of the file:

```typescript
function setupMarketData(overrides: Parameters<typeof createMockClient>[0] = {}) {
  const client = createMockClient({ get: vi.fn().mockResolvedValue({}), ...overrides });
  const { tool, handlers } = createMockServer();
  registerMarketDataTools(tool as any, client, demoPaths);
  return { client, handlers };
}

describe("search_instruments handler", () => {
  it("returns symbol matches directly when found", async () => {
    const { client, handlers } = setupMarketData({
      get: vi.fn().mockResolvedValue({ items: [{ instrumentId: 1 }] }),
    });
    const result = await handlers.get("search_instruments")!({ query: "AAPL", filterBy: "symbol", page: 1, pageSize: 20 });
    expect(client.get).toHaveBeenCalledWith(demoPaths.marketData("search"), { InternalSymbolFull: "AAPL", pageNumber: 1, pageSize: 20 });
    expect(JSON.parse(result.content[0].text).items).toHaveLength(1);
  });

  it("falls back to name search when symbol search returns nothing", async () => {
    const { client, handlers } = setupMarketData({
      get: vi.fn()
        .mockResolvedValueOnce({ items: [] })
        .mockResolvedValueOnce({ items: [{ instrumentId: 2 }] }),
    });
    const result = await handlers.get("search_instruments")!({ query: "Apple", filterBy: "symbol", page: 1, pageSize: 20 });
    expect(client.get).toHaveBeenNthCalledWith(2, demoPaths.marketData("search"), { internalInstrumentDisplayName: "Apple", pageNumber: 1, pageSize: 20 });
    expect(JSON.parse(result.content[0].text).items).toHaveLength(1);
  });

  it("searches by name directly when filterBy is name", async () => {
    const { client, handlers } = setupMarketData({ get: vi.fn().mockResolvedValue({ items: [] }) });
    await handlers.get("search_instruments")!({ query: "Apple", filterBy: "name", page: 1, pageSize: 20 });
    expect(client.get).toHaveBeenCalledTimes(1);
    expect(client.get).toHaveBeenCalledWith(demoPaths.marketData("search"), { internalInstrumentDisplayName: "Apple", pageNumber: 1, pageSize: 20 });
  });

  it("returns errorContent when the client throws", async () => {
    const { handlers } = setupMarketData({ get: vi.fn().mockRejectedValue(new Error("boom")) });
    const result = await handlers.get("search_instruments")!({ query: "AAPL", filterBy: "symbol", page: 1, pageSize: 20 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to search instruments: boom");
  });
});

describe("get_instruments handler", () => {
  it("delegates to fetchInstrumentsBatch", async () => {
    const { client, handlers } = setupMarketData({
      get: vi.fn().mockResolvedValue({ instrumentDisplayDatas: [{ instrumentID: 1 }] }),
    });
    const result = await handlers.get("get_instruments")!({ instrumentIds: "1" });
    expect(client.get).toHaveBeenCalledWith(demoPaths.marketData("instruments"), { instrumentIds: "1" });
    expect(JSON.parse(result.content[0].text)).toEqual({ instrumentDisplayDatas: [{ instrumentID: 1 }] });
  });

  it("returns errorContent when the client throws", async () => {
    const { handlers } = setupMarketData({ get: vi.fn().mockRejectedValue(new Error("boom")) });
    const result = await handlers.get("get_instruments")!({ instrumentIds: "1" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to get instruments: boom");
  });
});

describe("get_rates handler", () => {
  it("fetches current rates without enrichment by default", async () => {
    const { client, handlers } = setupMarketData({ get: vi.fn().mockResolvedValue({ rates: [] }) });
    await handlers.get("get_rates")!({ instrumentIds: "1,2", type: "current", includeNames: false });
    expect(client.get).toHaveBeenCalledWith(demoPaths.marketData("instruments/rates"), { instrumentIds: "1,2" });
  });

  it("fetches closing price rates when type is closing_price", async () => {
    const { client, handlers } = setupMarketData({ get: vi.fn().mockResolvedValue({ rates: [] }) });
    await handlers.get("get_rates")!({ instrumentIds: "1", type: "closing_price", includeNames: false });
    expect(client.get).toHaveBeenCalledWith(demoPaths.marketData("instruments/history/closing-price"), { instrumentIds: "1" });
  });

  it("enriches rates with names when includeNames is true", async () => {
    const { handlers } = setupMarketData({
      get: vi.fn()
        .mockResolvedValueOnce({ rates: [{ instrumentID: 1 }] })
        .mockResolvedValueOnce({ instrumentDisplayDatas: [{ instrumentID: 1, instrumentDisplayName: "Apple", symbolFull: "AAPL" }] }),
    });
    const result = await handlers.get("get_rates")!({ instrumentIds: "1", type: "current", includeNames: true });
    expect(JSON.parse(result.content[0].text).rates[0]).toMatchObject({ instrumentDisplayName: "Apple" });
  });

  it("falls back to unenriched rates if enrichment throws", async () => {
    const { handlers } = setupMarketData({
      get: vi.fn()
        .mockResolvedValueOnce({ rates: [{ instrumentID: 1 }] })
        .mockRejectedValueOnce(new Error("enrich failed")),
    });
    const result = await handlers.get("get_rates")!({ instrumentIds: "1", type: "current", includeNames: true });
    expect(JSON.parse(result.content[0].text)).toEqual({ rates: [{ instrumentID: 1 }] });
  });

  it("returns errorContent when the client throws", async () => {
    const { handlers } = setupMarketData({ get: vi.fn().mockRejectedValue(new Error("boom")) });
    const result = await handlers.get("get_rates")!({ instrumentIds: "1", type: "current", includeNames: false });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to get rates: boom");
  });
});

describe("get_candles handler", () => {
  it("fetches and flattens candles", async () => {
    const { client, handlers } = setupMarketData({
      get: vi.fn().mockResolvedValue({ candles: [{ candles: [{ open: 1, close: 2, volume: null }] }] }),
    });
    const result = await handlers.get("get_candles")!({ instrumentId: 1, interval: "OneDay", count: 100, direction: "desc" });
    expect(client.get).toHaveBeenCalledWith(demoPaths.marketData("instruments/1/history/candles/desc/OneDay/100"));
    expect(JSON.parse(result.content[0].text)[0].Volume).toBe(0);
  });

  it("returns errorContent when the client throws", async () => {
    const { handlers } = setupMarketData({ get: vi.fn().mockRejectedValue(new Error("boom")) });
    const result = await handlers.get("get_candles")!({ instrumentId: 1, interval: "OneDay", count: 100, direction: "desc" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to get candles: boom");
  });
});

describe("get_reference_data handler", () => {
  it("fetches and caches instrument_types", async () => {
    const { client, handlers } = setupMarketData({ get: vi.fn().mockResolvedValue({ instrumentTypes: [] }) });
    const first = await handlers.get("get_reference_data")!({ type: "instrument_types" });
    expect(client.get).toHaveBeenCalledWith(demoPaths.marketData("instrument-types"), {});
    expect(JSON.parse(first.content[0].text)).toEqual({ instrumentTypes: [] });

    // Second call within TTL should be served from cache, no extra client.get call
    const callsBefore = (client.get as any).mock.calls.length;
    await handlers.get("get_reference_data")!({ type: "instrument_types" });
    expect((client.get as any).mock.calls.length).toBe(callsBefore);
  });

  it("filters exchanges by ids param", async () => {
    const { client, handlers } = setupMarketData({ get: vi.fn().mockResolvedValue({ exchangeInfo: [] }) });
    await handlers.get("get_reference_data")!({ type: "exchanges", ids: "1,2" });
    expect(client.get).toHaveBeenCalledWith(demoPaths.marketData("exchanges"), { exchangeIds: "1,2" });
  });

  it("returns errorContent when the client throws", async () => {
    const { handlers } = setupMarketData({ get: vi.fn().mockRejectedValue(new Error("boom")) });
    const result = await handlers.get("get_reference_data")!({ type: "stocks_industries" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to get reference data: boom");
  });
});

describe("get_market_status handler", () => {
  it("reports found instruments with tradability flags", async () => {
    const { handlers } = setupMarketData({
      get: vi.fn().mockResolvedValue({
        items: [{ internalInstrumentId: 1, internalInstrumentDisplayName: "Apple", isCurrentlyTradable: true, isExchangeOpen: true }],
      }),
    });
    const result = await handlers.get("get_market_status")!({ symbols: "AAPL" });
    expect(JSON.parse(result.content[0].text)[0]).toMatchObject({ symbol: "AAPL", found: true, isCurrentlyTradable: true });
  });

  it("reports not-found for unmatched symbols", async () => {
    const { handlers } = setupMarketData({ get: vi.fn().mockResolvedValue({ items: [] }) });
    const result = await handlers.get("get_market_status")!({ symbols: "ZZZZ" });
    expect(JSON.parse(result.content[0].text)).toEqual([{ symbol: "ZZZZ", found: false }]);
  });

  it("returns errorContent when the client throws", async () => {
    const { handlers } = setupMarketData({ get: vi.fn().mockRejectedValue(new Error("boom")) });
    const result = await handlers.get("get_market_status")!({ symbols: "AAPL" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to get market status: boom");
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run tests/unit/tools/market-data.test.ts`
Expected: all previous tests plus 18 new ones pass.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/tools/market-data.test.ts
git commit -m "test: cover all 6 market-data handlers (all branches)"
```

---

## Task 11: `server.ts` smoke test

**Files:**
- Create: `tests/unit/server.test.ts`

**Interfaces:**
- Consumes: `createServer` from `src/server.ts`. Relies on the SDK's real (undocumented but stable within this major version) `_registeredTools` map on `McpServer` instances — no mocking needed since this is a pure wiring smoke test.

- [ ] **Step 1: Write the test**

```typescript
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

  it("registers all 18 MCP tools exactly once", () => {
    const server = createServer();
    const registered = Object.keys((server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools);

    expect(registered.sort()).toEqual([...ALL_TOOL_NAMES].sort());
    expect(registered).toHaveLength(ALL_TOOL_NAMES.length);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run tests/unit/server.test.ts`
Expected: 1 passed. If the tool-name list mismatches, that means a tool was renamed/added/removed since this plan was written — update `ALL_TOOL_NAMES` to match reality, don't weaken the assertion.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/server.test.ts
git commit -m "test: verify createServer registers all 18 MCP tools"
```

---

## Task 12: Small coverage gaps — `client.ts`, `rate-limiter.ts`, `table-formatter.ts`, `config.ts`

**Files:**
- Modify: `tests/unit/client.test.ts` (append)
- Modify: `tests/unit/utils/rate-limiter.test.ts` (append)
- Modify: `tests/unit/utils/table-formatter.test.ts` (append)

**Interfaces:**
- No new exports needed — these test existing public methods/functions with previously-unexercised inputs.

- [ ] **Step 1: Append to `tests/unit/client.test.ts`**

```typescript
describe("getRateLimitStatus", () => {
  it("returns the status of all rate-limit buckets", () => {
    const client = new EtoroClient(
      { apiKey: "k", userKey: "u", environment: "demo" },
      { fetchFn: vi.fn() as unknown as typeof fetch },
    );
    const status = client.getRateLimitStatus();
    expect(status).toHaveProperty("GET");
    expect(status).toHaveProperty("WRITE");
  });
});

describe("verbose logging", () => {
  it("writes rate-limit status to stderr when verbose is true", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const client = new EtoroClient(
      { apiKey: "k", userKey: "u", environment: "demo" },
      { fetchFn: mockFetch as unknown as typeof fetch, verbose: true },
    );

    await client.get("/api/v1/me");

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("[rate-limit] GET"));
    stderrSpy.mockRestore();
  });
});
```

Check the top of `tests/unit/client.test.ts` for its existing `EtoroClient` import and `vi` import — reuse them; do not add duplicate imports.

- [ ] **Step 2: Append to `tests/unit/utils/rate-limiter.test.ts`**

```typescript
it("does not wait when the bucket has room again exactly at check time", async () => {
  const limiter = new RateLimiter({ getLimit: 1, windowMs: 100 });

  await limiter.acquire("GET");
  await vi.advanceTimersByTimeAsync(100); // window fully elapses before the 2nd acquire
  await limiter.acquire("GET"); // should resolve immediately — waitMs <= 0 branch

  // No assertion needed beyond "this resolves without hanging" (test times out otherwise)
});
```

- [ ] **Step 3: Append to `tests/unit/utils/table-formatter.test.ts`**

```typescript
it("returns null for non-array input", () => {
  expect(formatTable({ not: "an array" })).toBeNull();
});

it("returns null for an empty array", () => {
  expect(formatTable([])).toBeNull();
});

it("returns null when rows have more than 15 columns", () => {
  const wideRow: Record<string, number> = {};
  for (let i = 0; i < 16; i++) wideRow[`col${i}`] = i;
  expect(formatTable([wideRow])).toBeNull();
});
```

Check the top of `tests/unit/utils/table-formatter.test.ts` for the existing `formatTable` import — reuse it.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/client.test.ts tests/unit/utils/rate-limiter.test.ts tests/unit/utils/table-formatter.test.ts`
Expected: all previous tests plus 6 new ones pass.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/client.test.ts tests/unit/utils/rate-limiter.test.ts tests/unit/utils/table-formatter.test.ts
git commit -m "test: close small coverage gaps in client, rate-limiter, table-formatter"
```

---

## Task 13: `cli.ts` testability export

**Files:**
- Modify: `src/cli.ts`

**Interfaces:**
- Produces: `export async function main(): Promise<void>` (was previously an unexported top-level function) and `export function parseArgs(argv: string[]): ParsedArgs` (was previously unexported). No behavior changes — the existing `main().catch(...)` call at the bottom of the file stays exactly as is.

This task exists because `main()` reads `process.argv` and constructs its own `EtoroClient` — to test it (Task 14) we need to `import { main } from "../src/cli.js"` and `vi.mock("../src/client.js")`, which requires `main` to be exported. `parseArgs` is exported too since it's cleanly pure and worth testing in isolation.

- [ ] **Step 1: Export the two functions**

In `src/cli.ts`, change:
```typescript
function parseArgs(argv: string[]): ParsedArgs {
```
to:
```typescript
export function parseArgs(argv: string[]): ParsedArgs {
```

And change:
```typescript
async function main() {
```
to:
```typescript
export async function main(): Promise<void> {
```

- [ ] **Step 2: Verify the build and existing tests still pass**

Run: `npm run build && npm test`
Expected: both pass — this is a pure export-visibility change, nothing else moves.

- [ ] **Step 3: Commit**

```bash
git add src/cli.ts
git commit -m "refactor: export main and parseArgs from cli.ts for testability

No behavior change — main() is still invoked the same way at the
bottom of the file. This only makes both functions importable from
tests."
```

---

## Task 14: `cli.ts` command-dispatch tests

**Files:**
- Create: `tests/unit/cli.test.ts`

**Interfaces:**
- Consumes: `main`, `parseArgs` from `src/cli.js` (Task 13). Mocks the whole `../../src/client.js` module with `vi.mock`, so every `new EtoroClient(...)` call inside `main()` returns a fake instance whose methods are `vi.fn()`s the test controls.

- [ ] **Step 1: Write `parseArgs` unit tests (pure, no mocking)**

```typescript
// tests/unit/cli.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseArgs } from "../../src/cli.js";

describe("parseArgs", () => {
  it("splits positional args from flags", () => {
    const { positional, flags } = parseArgs(["market", "search", "AAPL", "--filter-by", "symbol"]);
    expect(positional).toEqual(["market", "search", "AAPL"]);
    expect(flags).toEqual({ "filter-by": "symbol" });
  });

  it("supports --flag=value syntax", () => {
    const { flags } = parseArgs(["identity", "--output=table"]);
    expect(flags).toEqual({ output: "table" });
  });

  it("treats a trailing flag with no value as boolean true", () => {
    const { flags } = parseArgs(["identity", "--verbose"]);
    expect(flags).toEqual({ verbose: "true" });
  });

  it("does not treat a global flag's value as positional", () => {
    const { positional, flags } = parseArgs(["--api-key", "abc123", "identity"]);
    expect(positional).toEqual(["identity"]);
    expect(flags).toEqual({ "api-key": "abc123" });
  });
});
```

- [ ] **Step 2: Run the pure tests**

Run: `npx vitest run tests/unit/cli.test.ts`
Expected: 4 passed.

- [ ] **Step 3: Write `main()` command-dispatch tests with a mocked `EtoroClient`**

Append to the same file:

```typescript
vi.mock("../../src/client.js", () => {
  const EtoroClient = vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue({ mocked: true }),
    post: vi.fn().mockResolvedValue({ mocked: true }),
    put: vi.fn().mockResolvedValue({ mocked: true }),
    patch: vi.fn().mockResolvedValue({ mocked: true }),
    delete: vi.fn().mockResolvedValue({ mocked: true }),
  }));
  return { EtoroClient };
});

describe("main() command dispatch", () => {
  const originalArgv = process.argv;
  const originalEnv = { ...process.env };
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    process.env.ETORO_API_KEY = "test-key";
    process.env.ETORO_USER_KEY = "test-user";
    process.env.ETORO_ENVIRONMENT = "demo";
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env = { ...originalEnv };
    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("prints help with no command", async () => {
    process.argv = ["node", "cli.js"];
    const { main } = await import("../../src/cli.js");
    await main();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Usage: etoro-cli"));
  });

  it("dispatches the identity command", async () => {
    process.argv = ["node", "cli.js", "identity"];
    const { main } = await import("../../src/cli.js");
    await main();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"mocked": true'));
  });

  it("errors on an unknown market subcommand", async () => {
    process.argv = ["node", "cli.js", "market", "bogus"];
    const { main } = await import("../../src/cli.js");
    await main();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Unknown market subcommand: bogus"));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("errors when a required positional argument is missing", async () => {
    process.argv = ["node", "cli.js", "market", "search"];
    const { main } = await import("../../src/cli.js");
    await main();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Missing required argument: <query>"));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("renders table output when --output=table is passed", async () => {
    process.argv = ["node", "cli.js", "identity", "--output=table"];
    const { main } = await import("../../src/cli.js");
    await main();
    // { mocked: true } is a single object, not an array of objects, so formatTable
    // returns null and main() falls back to JSON — assert that fallback happened.
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"mocked": true'));
  });
});
```

Note: `main` is re-imported dynamically (`await import(...)`) inside each `it` after `process.argv`/`process.env` are set, because `main()` reads them at call time, not at module-load time — a static top-level import would work too since `main()` only reads `process.argv` when *invoked*, but the dynamic import keeps each test's intent explicit. Either style works; keep them consistent within the file.

- [ ] **Step 4: Run all the CLI tests**

Run: `npx vitest run tests/unit/cli.test.ts`
Expected: 9 passed (4 `parseArgs` + 5 `main()` dispatch).

- [ ] **Step 5: Commit**

```bash
git add tests/unit/cli.test.ts
git commit -m "test: cover cli.ts parseArgs and main() command dispatch"
```

---

## Task 15: Enforce real coverage thresholds + fix the CLAUDE.md claim

**Files:**
- Modify: `vitest.config.ts`
- Modify: `CLAUDE.md` (only if the achieved number differs materially from "80%")

**Interfaces:**
- No code interfaces — this is a config + docs task, done last so the threshold reflects what Tasks 1–14 actually achieved.

- [ ] **Step 1: Run the full coverage report**

Run: `npm run test:coverage`
Record the resulting overall `% Stmts` / `% Branch` / `% Funcs` / `% Lines` numbers from the summary table.

- [ ] **Step 2: Add a `thresholds` block to `vitest.config.ts`**

Set each threshold a few points below the actual achieved number (so incidental future refactors don't immediately fail CI), but no lower than 75% for statements/lines and 70% for branches — if the achieved numbers from Step 1 are lower than that floor, stop and add more tests rather than lowering the bar silently.

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts"],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
  },
});
```

(Replace the numbers with whatever Step 1 actually measured, per the floors above — do not copy these placeholders verbatim without checking against the real report.)

- [ ] **Step 3: Verify the threshold gate actually fails on a regression**

Temporarily comment out one `it()` block in any test file added in this plan, run `npm run test:coverage`, and confirm the command now exits non-zero with a coverage-threshold failure message. Then restore the `it()` block and re-run to confirm it passes again.

- [ ] **Step 4: Reconcile CLAUDE.md**

Re-read the "Test: Vitest (80% coverage threshold enforced)" line in `CLAUDE.md`'s Tech Stack section. If Step 2's actual threshold differs from 80%, update that line to match the real enforced number so the doc stops being aspirational.

- [ ] **Step 5: Full verification**

Run: `npm run build && npm run lint && npm test && npm run test:coverage`
Expected: all four pass, and the coverage summary's overall numbers meet or exceed the thresholds set in Step 2.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts CLAUDE.md
git commit -m "test: enforce coverage thresholds now that unit coverage is real

Closes #<issue-number>"
```

---

## Self-Review Notes

- **Coverage of the analysis:** every 0%-or-low file identified in the Analysis table has a task (identity→2, discovery→3, feeds→4, social→5, agent-portfolios→6, watchlists→7, trading→8, portfolio→9, market-data→10, server→11, client/rate-limiter/table-formatter/config small gaps→12, cli.ts→13+14). The threshold enforcement itself is Task 15.
- **`config.ts` line 45** (non-`ZodError` rethrow branch) was deliberately *not* given a dedicated test: forcing `ConfigSchema.parse` to throw a non-Zod error requires mocking Zod internals, which is disproportionate effort for one defensive `throw error;` line. Note this explicitly if a reviewer asks why `config.ts` isn't at 100% — it's an accepted, documented gap, not an oversight.
- **Type/name consistency check:** `createMockServer()`/`createMockClient()` signatures (Task 1) are used identically across Tasks 2–11 and 14 — every consumer calls `handlers.get("<tool_name>")!` and casts `tool as any` when passing to `registerXxxTools` (the real signature expects a full `McpServer`; the mock only implements `.tool()`, hence the cast). This is intentional and consistent throughout.
- **No placeholders:** every step above has real, runnable test code and exact file paths — nothing is left as "add more tests" or "similar to Task N".
