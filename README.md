# etoro-agent

[![CI](https://github.com/raybooysen/etoro-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/raybooysen/etoro-agent/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org)

MCP server and CLI for the [eToro Public API](https://api-portal.etoro.com/). Two interfaces, one codebase — use the **MCP server** from AI assistants (Claude Desktop, Claude Code, Cursor, OpenClaw, Windsurf) or the **CLI** from your terminal, scripts, and agents.

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [CLI Reference](#cli-reference)
  - [Identity](#identity)
  - [Market Data](#market-data)
  - [Portfolio](#portfolio)
  - [Trading](#trading)
  - [Social](#social)
  - [Watchlists](#watchlists)
  - [Feeds](#feeds)
  - [Discovery](#discovery)
- [MCP Server Setup](#mcp-server-setup)
  - [Claude Desktop](#claude-desktop)
  - [Claude Code](#claude-code)
  - [OpenClaw](#openclaw)
  - [Cursor](#cursor)
  - [Windsurf](#windsurf)
  - [Dual Environment](#dual-environment-demo--real)
- [MCP Tools Reference](#mcp-tools-reference)
- [Demo vs Real](#demo-vs-real)
- [Rate Limits](#rate-limits)
- [Error Handling](#error-handling)
- [Development](#development)
- [License](#license)

## Features

| Category | Capabilities |
|----------|-------------|
| **Market Data** | Search instruments, live rates, historical candles (OHLC), closing prices, reference data (exchanges, industries, instrument types) |
| **Trading** | Market orders (by amount or units), limit orders, close positions (full or partial), cancel orders. Demo and real environments. |
| **Portfolio** | Current positions, P&L summary, order execution status, closed trade history |
| **Social** | Discover/search traders, public portfolios, gain metrics, daily performance, copier data |
| **Watchlists** | Full CRUD — create, rename, delete, reorder, add/remove instruments, default and public watchlists |
| **Feeds** | Instrument and user social feeds, create posts, comment on posts |
| **Discovery** | Curated investment lists, personalized market recommendations |
| **Agent Portfolios** | Create/manage agent portfolios and user tokens |

## Prerequisites

- **Node.js 22+**
- **eToro API keys** — two keys are required:
  - **API Key** (`x-api-key`) — obtained through the [eToro API Portal](https://api-portal.etoro.com) subscription
  - **User Key** (`x-user-key`) — generated in your eToro account at [Settings > Trading > API Key Management](https://www.etoro.com/settings/trading)

When creating your User Key, you choose:
- **Environment** — Demo or Real (keys are environment-specific)
- **Permissions** — Read (portfolio, market data) or Read+Write (trading, posts)
- **IP Whitelist** — optional restriction to specific IPs
- **Expiration** — optional expiry date

## Installation

```bash
git clone https://github.com/raybooysen/etoro-agent.git
cd etoro-agent
npm install
npm run build
```

## Configuration

Both the CLI and MCP server accept configuration via environment variables with optional CLI argument overrides. CLI arguments take priority.

| Config | Env Var | CLI Arg | Required | Default |
|--------|---------|---------|----------|---------|
| API Key | `ETORO_API_KEY` | `--api-key` | Yes | — |
| User Key | `ETORO_USER_KEY` | `--user-key` | Yes | — |
| Environment | `ETORO_ENVIRONMENT` | `--environment` | No | `demo` |

Set environment variables once to avoid repeating credentials:

```bash
export ETORO_API_KEY=your-api-key
export ETORO_USER_KEY=your-user-key
export ETORO_ENVIRONMENT=demo
```

Or pass inline with any command:

```bash
etoro-cli identity --api-key your-api-key --user-key your-user-key
```

---

## CLI Reference

The CLI outputs JSON to stdout and errors to stderr. Exit code 0 on success, 1 on failure. Pipe output to `jq` for filtering or to other tools for processing.

```
etoro-cli <command> [subcommand] [args] [options]
etoro-cli help
```

### Identity

Get the authenticated user's account information.

```bash
etoro-cli identity
```

### Market Data

#### Search instruments

Search for stocks, crypto, ETFs, indices, commodities, and currencies by symbol or name.

```bash
# Search by symbol (default — exact server-side match)
etoro-cli market search AAPL

# Search by name (client-side substring match)
etoro-cli market search Apple --filter-by name

# Paginate results
etoro-cli market search TSLA --page 1 --page-size 5
```

#### Get instrument metadata

Retrieve detailed metadata for instruments by their IDs. Multiple IDs are automatically fetched individually and merged (the eToro API only supports one ID per request).

```bash
# Single instrument
etoro-cli market instrument 1137

# Multiple instruments (auto-fans out into individual requests with rate limiting)
etoro-cli market instrument 1137,1001,1003
```

#### Get live rates

Get current market prices for instruments.

```bash
# Single instrument
etoro-cli market rates 1

# Multiple instruments (max 100, look up IDs with: etoro-cli market search <name>)
etoro-cli market rates <id1>,<id2>,<id3>
```

#### Get historical candles

Retrieve OHLC candle data for charting and analysis.

```bash
# Default: 100 daily candles, newest first
etoro-cli market candles 1

# 1-hour candles, last 50
etoro-cli market candles 1 --interval OneHour --count 50

# 5-minute candles, oldest first
etoro-cli market candles 1 --interval FiveMinutes --count 200 --direction asc
```

**Available intervals:** `OneMinute`, `FiveMinutes`, `TenMinutes`, `FifteenMinutes`, `ThirtyMinutes`, `OneHour`, `FourHours`, `OneDay`, `OneWeek`

#### Get reference data

Retrieve cached reference data (instrument types, exchanges, stock industries).

```bash
etoro-cli market ref instrument-types
etoro-cli market ref exchanges
etoro-cli market ref stocks-industries
```

### Portfolio

#### View positions

Get all current open positions in your portfolio.

```bash
etoro-cli portfolio positions
```

#### P&L summary

Get profit and loss summary for your portfolio.

```bash
etoro-cli portfolio pnl
```

#### Order status

Check the execution status of a specific order.

```bash
etoro-cli portfolio order 12345678
```

#### Trade history

Get closed trade history. The `--min-date` parameter is required.

```bash
# All trades since January 2025
etoro-cli portfolio history --min-date 2025-01-01

# Paginate
etoro-cli portfolio history --min-date 2025-01-01 --page 2 --page-size 10
```

### Trading

All trading commands route to demo or real API paths based on your configured environment. If you use a demo key with `--environment demo`, trades execute on your virtual portfolio.

#### Open a market order (by cash amount)

```bash
# Buy $100 of Apple stock with 1x leverage
etoro-cli trade open --instrument 1 --buy --leverage 1 --amount 100

# Short sell $50 of an instrument with 2x leverage (look up ID first)
# etoro-cli market search "Tesla" | jq '.items[0].instrumentId'
etoro-cli trade open --instrument <instrument_id> --sell --leverage 2 --amount 50

# With stop loss and take profit
etoro-cli trade open --instrument 1 --buy --leverage 1 --amount 100 \
  --stop-loss 145.00 --take-profit 200.00
```

#### Open a market order (by units)

```bash
# Buy 0.5 units of an instrument (look up ID first)
# etoro-cli market search "Bitcoin" | jq '.items[0].instrumentId'
etoro-cli trade open-units --instrument <instrument_id> --buy --leverage 1 --units 0.5
```

#### Close a position

```bash
etoro-cli trade close 12345678
```

#### Place a limit order

A limit order executes when the instrument reaches your specified price.

```bash
# Buy Apple when it hits $150
etoro-cli trade limit --instrument 1 --buy --leverage 1 --amount 100 --rate 150.00

# With stop loss and take profit
etoro-cli trade limit --instrument 1 --buy --leverage 1 --amount 100 --rate 150.00 \
  --stop-loss 140.00 --take-profit 180.00
```

#### Cancel an order

Cancel a pending open order or limit order.

```bash
etoro-cli trade cancel 12345678
```

### Social

#### Search for traders

Discover traders using eToro's search with filters.

```bash
# Find Popular Investors this year
etoro-cli social search --period CurrYear --popular-investor

# Paginate results
etoro-cli social search --period CurrYear --page 1 --page-size 10
```

**Available periods:** `CurrMonth`, `CurrQuarter`, `CurrYear`, `LastYear`, `LastTwoYears`, `OneMonthAgo`, `TwoMonthsAgo`, `ThreeMonthsAgo`, `SixMonthsAgo`, `OneYearAgo`

#### Get user info

View detailed information about a specific trader.

```bash
# Public portfolio
etoro-cli social user sometrader portfolio

# Historical gain metrics
etoro-cli social user sometrader gain

# Trade statistics
etoro-cli social user sometrader tradeinfo

# Daily gain data
etoro-cli social user sometrader daily-gain
```

#### Get copiers

Get copier information for the authenticated user (Popular Investors).

```bash
etoro-cli social copiers
```

### Watchlists

#### List all watchlists

```bash
etoro-cli watchlist list
```

#### Get a specific watchlist

```bash
etoro-cli watchlist get abc123
```

#### Create a watchlist

```bash
etoro-cli watchlist create "Tech Leaders"
```

#### Delete a watchlist

```bash
etoro-cli watchlist delete abc123
```

#### Add instruments to a watchlist

```bash
# Add instruments by ID (look up IDs first with: etoro-cli market search <name>)
etoro-cli watchlist add-items abc123 <id1>,<id2>,<id3>
```

#### Remove instruments from a watchlist

```bash
etoro-cli watchlist remove-items abc123 <id1>,<id2>
```

### Feeds

#### Read instrument feed

Get social posts about a specific instrument.

```bash
# Default: 20 posts
etoro-cli feed instrument 1

# Custom pagination
etoro-cli feed instrument 1 --take 50 --offset 20
```

#### Read user feed

Get social posts from a specific user.

```bash
etoro-cli feed user 12345 --take 10
```

#### Create a post

```bash
etoro-cli feed post --message "Bullish on tech this quarter!" --owner 12345
```

### Discovery

#### Curated investment lists

```bash
etoro-cli discovery curated
```

#### Personalized recommendations

```bash
# Default: 10 recommendations
etoro-cli discovery recommendations

# Custom count
etoro-cli discovery recommendations --count 25
```

### Scripting examples

The CLI outputs JSON, making it easy to use with `jq` and in scripts:

```bash
# Get Apple's current price
etoro-cli market rates 1 | jq '.[0].Ask'

# List instrument IDs from search
etoro-cli market search BTC | jq '.items[].instrumentId'

# Get total P&L
etoro-cli portfolio pnl | jq '.TotalPnL'

# Find Popular Investors with >20% yearly gain (using jq filtering)
etoro-cli social search --period CurrYear --popular-investor --page-size 50 | \
  jq '.Items[] | select(.Gain > 20) | {UserName, Gain, RiskScore}'
```

---

## MCP Server Setup

The MCP server exposes the same eToro API capabilities as 18 MCP tools, accessible from any MCP-compatible client. The server communicates via stdio transport.

### Claude Desktop

Edit your config file:
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "etoro": {
      "command": "node",
      "args": ["/absolute/path/to/etoro-agent/dist/index.js"],
      "env": {
        "ETORO_API_KEY": "your-api-key",
        "ETORO_USER_KEY": "your-user-key",
        "ETORO_ENVIRONMENT": "demo"
      }
    }
  }
}
```

Restart Claude Desktop after saving.

### Claude Code

Add via CLI:

```bash
claude mcp add etoro \
  -e ETORO_API_KEY=your-api-key \
  -e ETORO_USER_KEY=your-user-key \
  -e ETORO_ENVIRONMENT=demo \
  -- node /absolute/path/to/etoro-agent/dist/index.js
```

Or add to `~/.claude.json` manually:

```json
{
  "mcpServers": {
    "etoro": {
      "command": "node",
      "args": ["/absolute/path/to/etoro-agent/dist/index.js"],
      "env": {
        "ETORO_API_KEY": "your-api-key",
        "ETORO_USER_KEY": "your-user-key",
        "ETORO_ENVIRONMENT": "demo"
      }
    }
  }
}
```

Verify with `claude mcp list`.

### OpenClaw

Via CLI:

```bash
openclaw mcp set etoro '{"command":"node","args":["/absolute/path/to/etoro-agent/dist/index.js"],"env":{"ETORO_API_KEY":"your-api-key","ETORO_USER_KEY":"your-user-key","ETORO_ENVIRONMENT":"demo"}}'
```

Or add to your OpenClaw config under `mcp.servers`:

```json
{
  "mcp": {
    "servers": {
      "etoro": {
        "command": "node",
        "args": ["/absolute/path/to/etoro-agent/dist/index.js"],
        "env": {
          "ETORO_API_KEY": "your-api-key",
          "ETORO_USER_KEY": "your-user-key",
          "ETORO_ENVIRONMENT": "demo"
        }
      }
    }
  }
}
```

Verify with `openclaw mcp list`.

### Cursor

Create `.cursor/mcp.json` in your workspace root:

```json
{
  "mcpServers": {
    "etoro": {
      "command": "node",
      "args": ["/absolute/path/to/etoro-agent/dist/index.js"],
      "env": {
        "ETORO_API_KEY": "your-api-key",
        "ETORO_USER_KEY": "your-user-key",
        "ETORO_ENVIRONMENT": "demo"
      }
    }
  }
}
```

### Windsurf

Edit `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "etoro": {
      "command": "node",
      "args": ["/absolute/path/to/etoro-agent/dist/index.js"],
      "env": {
        "ETORO_API_KEY": "your-api-key",
        "ETORO_USER_KEY": "your-user-key",
        "ETORO_ENVIRONMENT": "demo"
      }
    }
  }
}
```

### Dual Environment (Demo + Real)

Configure two server instances to access both environments simultaneously. This works with any MCP client:

```json
{
  "mcpServers": {
    "etoro-demo": {
      "command": "node",
      "args": ["/absolute/path/to/etoro-agent/dist/index.js"],
      "env": {
        "ETORO_API_KEY": "demo-api-key",
        "ETORO_USER_KEY": "demo-user-key",
        "ETORO_ENVIRONMENT": "demo"
      }
    },
    "etoro-real": {
      "command": "node",
      "args": ["/absolute/path/to/etoro-agent/dist/index.js"],
      "env": {
        "ETORO_API_KEY": "real-api-key",
        "ETORO_USER_KEY": "real-user-key",
        "ETORO_ENVIRONMENT": "real"
      }
    }
  }
}
```

### Example MCP conversations

Once connected, you can ask your AI assistant things like:

- *"Search for Apple stock and show me the current price"*
- *"Buy $500 of Tesla with 1x leverage on my demo account"*
- *"Show my portfolio and calculate my total P&L"*
- *"Find the top popular investors this year with low risk scores"*
- *"Create a watchlist called 'Tech Leaders' and add AAPL, MSFT, GOOGL"*
- *"Show me 1-hour candles for Bitcoin over the last 24 hours"*
- *"Close my Tesla position"*
- *"What limit orders do I have open?"*

---

## MCP Tools Reference

| Tool | Description | Parameters |
|------|-------------|------------|
| `get_identity` | Get authenticated user's account info | — |
| `search_instruments` | Search instruments by symbol or name | `query`, `filterBy` (symbol/name), `page`, `pageSize` |
| `get_instruments` | Get instrument metadata by ID | `instrumentIds` (comma-separated) |
| `get_rates` | Get current prices or closing prices | `instrumentIds`, `type` (current/closing_price), `includeNames` (opt-in) |
| `get_candles` | Get OHLC candle data | `instrumentId`, `interval`, `count`, `direction` |
| `get_reference_data` | Get instrument types, exchanges, or industries | `type`, `ids` (optional filter) |
| `open_order` | Open a market order | `order_type` (by_amount/by_units), `InstrumentID`, `IsBuy`, `Leverage`, `Amount`/`AmountInUnits` |
| `close_position` | Close an open position | `positionId`, `UnitsToDeduct` (optional partial close) |
| `manage_order` | Cancel or place limit orders | `action` (cancel_open_order/cancel_close_order/place_limit_order/cancel_limit_order), `orderId`, order params |
| `get_portfolio` | View positions, P&L, or order status | `view` (positions/pnl/order), `orderId` |
| `get_trade_history` | Get closed trade history | `minDate` (YYYY-MM-DD), `page`, `pageSize` |
| `search_people` | Search/discover traders | `action` (search/lookup), `period`, filters |
| `get_user_info` | Get user portfolio, gain, trade info | `view` (portfolio/tradeinfo/gain/daily_gain/copiers), `username` |
| `manage_watchlists` | Full watchlist CRUD | `action` (list/get/create/delete/rename/add_items/remove_items/...), params per action |
| `get_discovery` | Curated lists or recommendations | `type` (curated_lists/recommendations), `count` |
| `get_feeds` | Read instrument or user feeds | `type` (instrument/user), `id`, `take`, `offset` |
| `create_post` | Create a post or comment | `action` (post/comment), `message`, `owner`/`postId` |
| `manage_agent_portfolios` | Agent portfolio CRUD + tokens | `action` (list/create/delete/create_token/revoke_token/update_token), params per action |

---

## Demo vs Real

eToro API keys are **environment-specific** — you choose Demo or Real when generating keys. The server uses different API paths based on your configured environment:

| Category | Demo Path | Real Path |
|----------|-----------|-----------|
| Trading execution | `/trading/execution/demo/...` | `/trading/execution/...` |
| Portfolio | `/trading/info/demo/portfolio` | `/trading/info/portfolio` |
| P&L | `/trading/info/demo/pnl` | `/trading/info/real/pnl` |
| Order info | `/trading/info/demo/orders/{id}` | `/trading/info/real/orders/{id}` |

Market data, social, watchlists, feeds, and discovery endpoints are **shared** — they work the same regardless of environment.

If there's a key/environment mismatch (e.g., a demo key with `--environment real`), the eToro API returns an authentication error. The server never blocks requests — it routes to the configured paths and passes through whatever eToro returns.

## Rate Limits

The eToro API enforces rate limits on a **rolling 1-minute window**:

| Limit | Operations |
|-------|-----------|
| **60 req/min** | GET — market data, portfolio queries, social, watchlist reads |
| **20 req/min** | Write — trade execution, watchlist mutations, posts |

The client proactively tracks request timestamps and waits when a bucket is full. If the server still returns HTTP 429, it retries with exponential backoff (max 3 retries).

Reference data (instrument types, exchanges, industries) is cached for 24 hours to conserve rate limit quota.

## Error Handling

### CLI errors

Errors are written to stderr as JSON with a non-zero exit code:

```json
{
  "error": "HTTP 401: Unauthorized",
  "statusCode": 401,
  "errorCode": "Unauthorized",
  "body": {
    "errorCode": "Unauthorized",
    "errorMessage": "Unauthorized"
  }
}
```

### MCP errors

MCP tool handlers never throw. On failure, they return `{ isError: true, content: [{ type: "text", text: "error message" }] }`, allowing the AI assistant to handle the error gracefully.

### Common errors

| Status | Meaning | Resolution |
|--------|---------|------------|
| 401 | Invalid or expired API keys | Regenerate keys in eToro Settings |
| 403 | Insufficient permissions | Ensure key has Read+Write for trading |
| 429 | Rate limit exceeded | Wait and retry (automatic) |
| 400 | Invalid request parameters | Check parameter values and types |

## Development

```bash
npm run build          # Compile TypeScript (MCP + CLI)
npm run dev            # Run MCP server with hot-reload
npm run cli            # Run CLI with hot-reload (tsx)
npm test               # Run unit tests
npm run test:watch     # Run tests in watch mode
npm run test:coverage  # Run tests with coverage report
npm run test:integration  # Run integration tests (requires .env)
npm run lint           # Run ESLint
```

Run a single test file:

```bash
npx vitest run tests/unit/utils/cache.test.ts
```

### Integration tests

Copy `.env.example` to `.env`, fill in your API keys, and run:

```bash
cp .env.example .env
# Edit .env with your keys
npm run test:integration
```

## License

[MIT](LICENSE)
