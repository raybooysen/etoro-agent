# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP server and CLI for the eToro Public API. Provides 18 MCP tools and a full CLI covering trading execution, portfolio management, market data, social/copy trading, watchlists, feeds, discovery, and agent portfolios. Two entry points: `src/index.ts` (MCP via stdio) and `src/cli.ts` (CLI).

## Tech Stack

- **Runtime:** Node.js 18+ (ESM via `"type": "module"`)
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
npm test               # vitest run
npm run test:watch     # vitest (watch mode)
npm run test:coverage  # vitest run --coverage
npm run lint           # eslint
```

Run a single test file: `npx vitest run tests/unit/utils/cache.test.ts`

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
    market-data.ts      # search_instruments, get_instruments, get_rates, get_candles, get_reference_data
    trading.ts          # open_order, close_position, manage_order
    portfolio.ts        # get_portfolio, get_trade_history
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
```

### Key patterns

- **Tool registration:** Each tool group file exports a `registerXxxTools(server, client, paths)` function. `server.ts` calls all of them.
- **Demo vs Real routing:** `PathResolver` encapsulates the asymmetric path patterns. Trading execution uses `/demo/` prefix for demo but no prefix for real. Portfolio uses `/demo/` for demo but no segment for real. PnL and order info use `/demo/` for demo and `/real/` for real. The environment is set via config, not per-request.
- **Multiplexed tools:** High-endpoint-count categories (watchlists: 15 endpoints, agent portfolios: 6) are collapsed into single MCP tools with an `action` enum parameter.
- **Error handling:** Every tool handler wraps in try/catch and returns `errorContent(...)` on failure — never throws.
- **Caching:** Reference data (instrument types, exchanges, industries) cached 24h. Instrument metadata cached 1h. Trading/portfolio/rates never cached.
- **SDK imports use `.js` extensions:** e.g., `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"` — required by NodeNext resolution.

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

### Conventions

- **Trading request bodies:** PascalCase fields (`InstrumentID`, `IsBuy`, `Leverage`, `Amount`)
- **Feed request bodies:** camelCase fields (`message`, `owner`, `tags`, `mentions`)
- **Pagination varies:** `pageNumber`/`pageSize` (search), `page`/`pageSize` (people), `take`/`offset` (feeds)
- **Trade history** requires `minDate` query param in `YYYY-MM-DD` format

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
