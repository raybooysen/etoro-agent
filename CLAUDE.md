# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Change Checklist

**Every code change must be end-to-end.** Before a change is considered complete, all applicable items must be done:

- [ ] **MCP tool** (`src/tools/*.ts`) — update tool registration, params, handler logic
- [ ] **CLI** (`src/cli.ts`) — update matching command, flags, output formatting
- [ ] **Unit tests** — for any new/changed exported functions (`tests/unit/`)
- [ ] **Integration tests** — against live API if endpoint behavior changed (`tests/integration/`)
- [ ] **SKILL.md** (`skills/etoro-agent/SKILL.md`) — MCP tools reference table, CLI command reference, workflow examples
- [ ] **README.md** — CLI examples, MCP tools table, limitations
- [ ] **CLAUDE.md** — architecture section if new files/patterns added
- [ ] **Build** — `npm run build` passes
- [ ] **Tests** — `npm test` and `npx vitest run tests/integration/` both pass
- [ ] **PR** — all changes go through a pull request. Never commit directly to main.

Partial changes (e.g. fixing the MCP tool but not the CLI, or updating code but not docs) are not acceptable. Both interfaces share the same codebase and must stay in sync.

## Git Workflow

- **Never commit directly to main.** All changes must go through a pull request.
- Create a feature/fix branch from main (e.g. `fix/search-filtering`, `feat/flatten-positions`).
- Each PR must reference a GitHub issue using `Closes #N` in the PR body so issues auto-close on merge.
- If no issue exists for the work, create one first.
- Rebase on main if the PR has merge conflicts before requesting review.

## Project Overview

MCP server and CLI for the eToro Public API. Provides 18 MCP tools and a full CLI covering trading execution, portfolio management, market data, social/copy trading, watchlists, feeds, discovery, and agent portfolios. Two entry points: `src/index.ts` (MCP via stdio) and `src/cli.ts` (CLI).

## Tech Stack

- **Runtime:** Node.js 22+ (ESM via `"type": "module"`)
- **Language:** TypeScript 5.7+ with `NodeNext` module resolution
- **MCP SDK:** `@modelcontextprotocol/sdk` v1.x (`McpServer` from `@modelcontextprotocol/sdk/server/mcp.js`)
- **Validation:** Zod (required peer dep of the SDK)
- **Test:** Vitest (80% coverage threshold enforced)
- **Transport:** stdio (spawned by MCP clients as a child process)

## Commands

```bash
npm run build          # tsc + chmod +x dist/index.js dist/cli.js
npm run dev            # tsx src/index.ts (hot-reload MCP server)
npm run start          # node dist/index.js (MCP server)
npm run cli            # tsx src/cli.ts (CLI dev mode)
npm test               # vitest run (unit tests only, excludes integration)
npm run test:watch     # vitest (watch mode)
npm run test:coverage  # vitest run --coverage
npm run lint           # eslint
```

Run a single test file: `npx vitest run tests/unit/utils/cache.test.ts`
Run integration tests (requires `.env` with API keys): `npx vitest run tests/integration/`

## Architecture

```
src/
  index.ts              # MCP entry point — stdio transport, signal handling
  cli.ts                # CLI entry point — command routing, JSON output
  server.ts             # Creates McpServer, wires all tool registrations
  client.ts             # EtoroClient — fetch wrapper with auth headers, rate limiting, retry on 429
  config.ts             # Loads config from env vars + CLI args (CLI wins), validates with Zod
  tools/
    identity.ts         # get_identity
    market-data.ts      # search_instruments, get_instruments, get_rates, get_candles, get_reference_data, get_market_status
                        #   + enrichWithNames() — cross-references instrument metadata into responses
                        #   + flattenCandles() — unwraps nested candle response, defaults null volume to 0
    trading.ts          # open_order, close_position, manage_order
    portfolio.ts        # get_portfolio, get_trade_history
                        #   + flattenPnl() — flattens clientPortfolio into TotalEquity/TotalPnL/Cash
                        #   + flattenPositions() — extracts positions array, promotes nested P&L fields
    social.ts           # search_people, get_user_info
    watchlists.ts       # manage_watchlists (15 endpoints multiplexed via action param)
    discovery.ts        # get_discovery
    feeds.ts            # get_feeds, create_post
    agent-portfolios.ts # manage_agent_portfolios (multiplexed via action param)
  types/
    api.ts              # Zod schemas for eToro API request/response shapes (PascalCase for trading)
    config.ts           # Config Zod schema + types
    errors.ts           # EtoroApiError class
  utils/
    path-resolver.ts    # Demo/real path resolution (handles asymmetric API path patterns)
    rate-limiter.ts     # Sliding-window rate limiter (GET: 60/min, WRITE: 20/min)
    cache.ts            # TTL cache for reference data
    formatters.ts       # jsonContent, textContent, errorContent MCP response helpers
    table-formatter.ts  # ASCII table formatter for CLI output
```

### Key patterns

- **Tool registration:** Each tool group file exports a `registerXxxTools(server, client, paths)` function. `server.ts` calls all of them.
- **CLI parity:** Every MCP tool must have a corresponding CLI command in `src/cli.ts`. Both must use the same underlying client calls and response processing (flattening, enrichment).
- **Demo vs Real routing:** `PathResolver` encapsulates the asymmetric path patterns. Trading execution uses `/demo/` prefix for demo but no prefix for real. Portfolio uses `/demo/` for demo but no segment for real. PnL and order info use `/demo/` for demo and `/real/` for real. The environment is set via config, not per-request.
- **Multiplexed tools:** High-endpoint-count categories (watchlists: 15 endpoints, agent portfolios: 6) are collapsed into single MCP tools with an `action` enum parameter.
- **Error handling:** Every tool handler wraps in try/catch and returns `errorContent(...)` on failure — never throws.
- **Caching:** Reference data (instrument types, exchanges, industries) cached 24h. Instrument metadata cached 1h. Trading/portfolio/rates never cached.
- **Response flattening:** The eToro API returns nested/wrapped objects. Helper functions (`flattenCandles`, `flattenPnl`, `flattenPositions`) unwrap these before returning to the user. Both MCP tools and CLI must apply the same flattening.
- **Instrument enrichment:** `enrichWithNames()` cross-references instrument metadata to add `instrumentDisplayName` and `symbolFull` to responses. Used in `get_rates` (opt-in via `includeNames`) and `get_portfolio` positions (always-on).
- **SDK imports use `.js` extensions:** e.g., `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"` — required by NodeNext resolution.

### Search behavior

The eToro API does **not** support free-text search. The `searchText` parameter is ignored. Instead:

- **Symbol search (default):** Uses `InternalSymbolFull` query param for exact server-side filtering (e.g. `AAPL`, `BTC`). Returns only matching instruments.
- **Name search (fallback):** Client-side substring matching on `instrumentDisplayName`, `symbolFull`, and `internalSymbolFull`. Fetches up to 3 pages (300 items) from the API and filters locally.
- The MCP tool exposes this via `filterBy: "symbol" | "name"` (default: `"symbol"`).
- The CLI uses `--filter-by symbol|name`.

## Configuration

Config is loaded from environment variables with optional CLI argument overrides (CLI wins):

| Config | Env Var | CLI Arg | Required | Default |
|--------|---------|---------|----------|---------|
| API Key | `ETORO_API_KEY` | `--api-key` | Yes | — |
| User Key | `ETORO_USER_KEY` | `--user-key` | Yes | — |
| Environment | `ETORO_ENVIRONMENT` | `--environment` | No | `demo` |

eToro API keys are environment-specific (you choose Demo or Real when generating). The server routes to demo or real API paths based on the configured environment. If there's a key/environment mismatch, the eToro API returns the error.

## eToro API

**Base URL:** `https://public-api.etoro.com`

### Authentication (every request)

| Header | Source |
|--------|--------|
| `x-api-key` | Config `apiKey` |
| `x-user-key` | Config `userKey` |
| `x-request-id` | `crypto.randomUUID()` per request |

### Rate limits (rolling 1-minute window)

- **60 req/min** — GET (market data, portfolio, social, watchlist reads)
- **20 req/min** — Write operations (trade execution, watchlist mutations, posts)
- Client proactively enforces rate limits via sliding-window tracker. Retries on 429 with exponential backoff (max 3 attempts).

### Path asymmetry (demo vs real)

| Category | Demo | Real |
|----------|------|------|
| Trading execution | `/trading/execution/demo/{subpath}` | `/trading/execution/{subpath}` |
| Portfolio | `/trading/info/demo/portfolio` | `/trading/info/portfolio` |
| PnL | `/trading/info/demo/pnl` | `/trading/info/real/pnl` |
| Order info | `/trading/info/demo/orders/{id}` | `/trading/info/real/orders/{id}` |

### API response conventions

**All responses use camelCase field names** (not PascalCase). Responses are wrapped in objects, not bare arrays:

| Endpoint | Response shape | Key fields |
|----------|---------------|------------|
| Search | `{ items: [...], totalItems, page, pageSize }` | `instrumentId` |
| Instruments | `{ instrumentDisplayDatas: [...] }` | `instrumentID`, `instrumentDisplayName` |
| Rates | `{ rates: [...] }` | `instrumentID`, `ask`, `bid`, `lastExecution` |
| Candles | `{ candles: [{ candles: [...] }] }` | `open`, `high`, `low`, `close`, `volume` |
| Portfolio | `{ clientPortfolio: { positions: [...], credit, unrealizedPnL } }` | `positionID`, `instrumentID` |
| Instrument types | `{ instrumentTypes: [...] }` | `instrumentTypeID` |
| Exchanges | `{ exchangeInfo: [...] }` | `exchangeID` |
| Stock industries | `{ stocksIndustries: [...] }` | — |

**Request body conventions:**
- **Trading request bodies:** PascalCase fields (`InstrumentID`, `IsBuy`, `Leverage`, `Amount`)
- **Feed request bodies:** camelCase fields (`message`, `owner`, `tags`, `mentions`)
- **Pagination varies:** `pageNumber`/`pageSize` (search), `page`/`pageSize` (people), `take`/`offset` (feeds)
- **Trade history** requires `minDate` query param in `YYYY-MM-DD` format

### Known API limitations

- **No position SL/TP modification.** The eToro Public API does not support modifying stop loss or take profit on existing positions. The endpoint exists in eToro's internal session API (`PUT /sapi/trade-{mode}/positions/{id}`) but is not exposed in the public API. The only workaround is close + reopen.
- **No free-text search.** The `searchText` parameter is ignored. Use `InternalSymbolFull` for server-side symbol filtering, or fetch + filter client-side for name search.
- **Instrument IDs are not stable.** Do not hardcode instrument IDs — always use `search_instruments` to discover IDs at runtime.
- **No batch instrument lookup.** The `/market-data/instruments` endpoint only supports one instrument ID per request. `fetchInstrumentsBatch()` transparently fans out multiple IDs into individual requests with 100ms delay between each, merging the results. This is rate-limit aware via the existing sliding-window tracker.

## Documentation files

Changes must be reflected across all documentation:

| File | Purpose | Update when |
|------|---------|-------------|
| `CLAUDE.md` | Developer guide, architecture, API conventions | New files, patterns, or API discoveries |
| `README.md` | User-facing: installation, CLI examples, MCP tools table | New commands, params, or limitations |
| `skills/etoro-agent/SKILL.md` | AI agent skill: workflows, tool reference, CLI reference | Any tool/CLI change |

## MCP Client Configuration

```json
{
  "mcpServers": {
    "etoro": {
      "command": "node",
      "args": ["dist/index.js"],
      "env": {
        "ETORO_API_KEY": "your-api-key",
        "ETORO_USER_KEY": "your-user-key",
        "ETORO_ENVIRONMENT": "demo"
      }
    }
  }
}
```
