---
name: etoro-agent
description: Trade, research, and manage portfolios on eToro via CLI and MCP tools. Covers market data, trading execution, portfolio management, social/copy trading, watchlists, feeds, and discovery. Activate when user mentions eToro, stocks, trading, portfolio, watchlists, or market data.
origin: project
---

# eToro Agent

Two interfaces to the eToro Public API — use the **MCP tools** when operating as an AI assistant, or the **CLI** when running from shell scripts, agents, or the terminal. Both share the same codebase, auth, rate limiting, and path routing.

## When to Use

Activate this skill when the user:
- Asks about eToro, trading, stocks, crypto, ETFs, or their portfolio
- Wants to search for instruments, get prices, or view candles
- Wants to open/close trades or manage orders
- Asks about popular investors, copy trading, or trader discovery
- Wants to manage watchlists, read feeds, or create posts
- Needs market research, price analysis, or portfolio monitoring
- Mentions "demo account" or "paper trading"

### CLI vs MCP — When to Use Which

| Scenario | Use | Why |
|----------|-----|-----|
| AI assistant responding to user | **MCP tools** | Native integration, structured responses |
| Shell scripts and automation | **CLI** | Pipe JSON to jq, compose with other tools |
| Agent loops and autonomous workflows | **CLI** | Easy to invoke from Bash, parseable output |
| Quick interactive lookups | **CLI** | Fastest path from terminal |
| Multi-step research for user | **MCP tools** | Better for conversational context |

## Configuration

Two keys are required for all operations:

| Key | Header | Source |
|-----|--------|--------|
| **API Key** | `x-api-key` | [eToro API Portal](https://api-portal.etoro.com) subscription |
| **User Key** | `x-user-key` | eToro Settings > Trading > API Key Management |

Keys are environment-specific — choose Demo or Real when generating.

### Setup

**Environment variables (recommended):**
```bash
export ETORO_API_KEY=your-api-key
export ETORO_USER_KEY=your-user-key
export ETORO_ENVIRONMENT=demo    # or "real"
```

**CLI argument overrides (take priority):**
```bash
etoro-cli identity --api-key xxx --user-key xxx --environment demo
```

**MCP server config (Claude Desktop, Cursor, etc.):**
```json
{
  "mcpServers": {
    "etoro": {
      "command": "node",
      "args": ["/path/to/etoro-agent/dist/index.js"],
      "env": {
        "ETORO_API_KEY": "your-api-key",
        "ETORO_USER_KEY": "your-user-key",
        "ETORO_ENVIRONMENT": "demo"
      }
    }
  }
}
```

---

## Workflows

### Workflow 1: Market Research → Trade

A complete flow from discovering an instrument to placing a trade.

**Step 1 — Find the instrument:**
```bash
# CLI
etoro-cli market search "AAPL" | jq '.items[] | {instrumentId}'

# Or search by name (client-side filter)
etoro-cli market search "Apple" --filter-by name | jq '.items[]'
```
```
# MCP: search_instruments(query: "AAPL")  — exact symbol match (default)
# MCP: search_instruments(query: "Apple", filterBy: "name")  — name substring match
```

**Step 2 — Check the current price:**
```bash
etoro-cli market rates 1 | jq '.[0] | {Ask, Bid, LastExecution}'
```
```
# MCP: get_rates(instrumentIds: "1", type: "current")
```

**Step 3 — Analyze recent price action:**
```bash
etoro-cli market candles 1 --interval OneHour --count 24 | jq '.[0:3]'
```
```
# MCP: get_candles(instrumentId: 1, interval: "OneHour", count: 24)
```

**Step 4 — Place the trade:**
```bash
etoro-cli trade open --instrument 1 --buy --leverage 1 --amount 100 --stop-loss 145 --take-profit 200
```
```
# MCP: open_order(order_type: "by_amount", InstrumentID: 1, IsBuy: true, Leverage: 1, Amount: 100, StopLossRate: 145, TakeProfitRate: 200)
```

**Step 5 — Verify the position:**
```bash
etoro-cli portfolio positions | jq '.[] | select(.instrumentID == 1) | {symbolFull, currentRate, pnL}'
```
```
# MCP: get_portfolio(view: "positions")
```

### Workflow 2: Portfolio Monitoring

Check positions, P&L, and review recent trade history.

```bash
# Current positions
etoro-cli portfolio positions | jq 'length'
# → number of open positions

# Position details with names and P&L
etoro-cli portfolio positions | jq '.[] | {symbolFull, instrumentDisplayName, currentRate, pnL, pnLPercent}'

# P&L summary
etoro-cli portfolio pnl | jq '{TotalPnL, TotalEquity, UnrealizedPnL, Cash}'

# Recent closed trades (with instrument names)
etoro-cli portfolio history --min-date 2025-01-01 --page-size 10 --include-names | jq '.items[] | {instrumentDisplayName, symbolFull, instrumentID, netProfit, closeDateTime}'

# Check a specific order status
etoro-cli portfolio order 12345678
```

### Workflow 3: Copy Trading Research

Find and evaluate popular investors to copy.

**Step 1 — Discover top performers:**
```bash
etoro-cli social search --period CurrYear --popular-investor --page-size 10 | \
  jq '.items[] | {userName, gain, riskScore, copiers}'
```

**Step 2 — Deep-dive a trader:**
```bash
# Their public portfolio
etoro-cli social user jaynemesis portfolio | jq '.[] | {instrumentID, direction, value}'

# Historical gain metrics
etoro-cli social user jaynemesis gain

# Trade statistics
etoro-cli social user jaynemesis tradeinfo
```

**Step 3 — Read their feed:**
```bash
etoro-cli feed user 12345 --take 5 | jq '.items[].message'
```

### Workflow 4: Watchlist Management

Create a themed watchlist and populate it.

```bash
# Create
etoro-cli watchlist create "AI Stocks" | jq '.WatchlistId'
# → "abc-123-def"

# Find instruments to add
NVDA_ID=$(etoro-cli market search "NVIDIA" | jq '.items[0].instrumentId')
MSFT_ID=$(etoro-cli market search "Microsoft" | jq '.items[0].instrumentId')
AMZN_ID=$(etoro-cli market search "Amazon" | jq '.items[0].instrumentId')

# Add instruments
etoro-cli watchlist add-items abc-123-def "$NVDA_ID,$MSFT_ID,$AMZN_ID"

# Verify
etoro-cli watchlist get abc-123-def

# Clean up
etoro-cli watchlist delete abc-123-def
```

### Workflow 5: Price Alert Script

A bash script that checks prices and reports:

```bash
#!/bin/bash
# Check if any watched instruments moved >2% today
# Look up IDs first:
# etoro-cli market search "Apple" | jq '.items[0].instrumentId'
# etoro-cli market search "Tesla" | jq '.items[0].instrumentId'
# etoro-cli market search "Bitcoin" | jq '.items[0].instrumentId'
INSTRUMENTS="<apple_id>,<tesla_id>,<bitcoin_id>"

etoro-cli market candles <apple_id> --interval OneDay --count 2 | \
  jq '
    (.[0].Close - .[1].Close) / .[1].Close * 100 |
    if . > 2 or . < -2 then "ALERT: \(.)% move" else "Normal" end
  '
```

---

## CLI Command Reference

All commands output JSON to stdout. Errors go to stderr with exit code 1.

### Identity

```bash
etoro-cli identity
```

### Market Data

```bash
# Search instruments by symbol (default, exact server-side match)
etoro-cli market search <symbol> [--page N] [--page-size N]

# Search instruments by name (client-side substring match)
etoro-cli market search <name> --filter-by name [--page N] [--page-size N]

# Get instrument metadata (comma-separated IDs supported — auto-fans out into individual requests)
etoro-cli market instrument <ids>              # e.g. 1137,1001,1003

# Get current market prices
etoro-cli market rates <ids>                   # comma-separated, max 100

# Get OHLC candle data (returns flat array of {Open,High,Low,Close,Volume,...})
# Volume defaults to 0 for crypto instruments where the API returns null
etoro-cli market candles <instrumentId> \
  [--interval OneDay] \                        # OneMinute|FiveMinutes|TenMinutes|
                                               # FifteenMinutes|ThirtyMinutes|OneHour|
                                               # FourHours|OneDay|OneWeek
  [--count 100] \                              # 1-1000
  [--direction desc]                           # asc|desc

# Get reference data (cached 24h)
etoro-cli market ref instrument-types
etoro-cli market ref exchanges
etoro-cli market ref stocks-industries

# Check if instruments are currently tradeable
etoro-cli market status AAPL,BTC,TSLA
```

### Portfolio

**Recommended:** Use `portfolio pnl` as the primary command for checking overall portfolio status. It returns a flattened summary with TotalEquity, TotalPnL, UnrealizedPnL, and Cash. Use `portfolio positions` when you need individual position details (instrument, direction, amount, leverage) -- positions include instrument names and flattened P&L fields when available.

```bash
etoro-cli portfolio pnl                        # P&L summary (start here)
etoro-cli portfolio positions                  # open positions with instrument names
etoro-cli portfolio order <orderId>            # order execution status
etoro-cli portfolio history \
  --min-date 2025-01-01 \                      # required, YYYY-MM-DD
  [--page N] [--page-size N]
```

### Trading

```bash
# Open market order by cash amount
etoro-cli trade open \
  --instrument <id> \                          # required
  --buy | --sell \                             # required (boolean flags)
  --leverage <n> \                             # required
  --amount <n> \                               # required
  [--stop-loss <rate>] \
  [--take-profit <rate>]

# Open market order by units
etoro-cli trade open-units \
  --instrument <id> --buy | --sell \
  --leverage <n> --units <n> \
  [--stop-loss <rate>] [--take-profit <rate>]

# Close a position
etoro-cli trade close <positionId>

# Place a limit order (executes when price reaches --rate)
# Works as BOTH limit entry AND stop entry:
#   - Rate BELOW market + buy = limit buy (dip buy)
#   - Rate ABOVE market + buy = stop buy (breakout entry)
#   - Rate ABOVE market + sell = limit sell (take profit)
#   - Rate BELOW market + sell = stop sell (breakdown entry)
etoro-cli trade limit \
  --instrument <id> --buy | --sell \
  --leverage <n> --amount <n> --rate <price> \
  [--stop-loss <rate>] [--take-profit <rate>]

# Example: breakout buy — enter TSLA if it breaks above 260
etoro-cli trade limit --instrument 1111 --buy --leverage 1 --amount 500 --rate 260 \
  --stop-loss 250 --take-profit 280

# Example: breakdown sell — short GOLD if it drops below 4300
etoro-cli trade limit --instrument 18 --sell --leverage 1 --amount 1000 --rate 4300 \
  --stop-loss 4400 --take-profit 4100

# Cancel a pending order (auto-detects limit vs market order)
etoro-cli trade cancel <orderId>
etoro-cli trade cancel <orderId> --type limit    # force limit order cancel
etoro-cli trade cancel <orderId> --type market   # force market order cancel
```

**Limitation: Modifying SL/TP on existing positions.** The eToro Public API does not support modifying stop-loss or take-profit on an open position. To change SL/TP, close the position and reopen it with the new SL/TP values:

```bash
# Close the existing position
etoro-cli trade close <positionId>

# Reopen with updated SL/TP
etoro-cli trade open --instrument <id> --buy --leverage 1 --amount 100 \
  --stop-loss <new-sl> --take-profit <new-tp>
```

### Social

```bash
# Search/discover traders
etoro-cli social search \
  --period <period> \                          # required: CurrMonth|CurrQuarter|
                                               # CurrYear|LastYear|LastTwoYears|
                                               # OneMonthAgo|TwoMonthsAgo|
                                               # ThreeMonthsAgo|SixMonthsAgo|OneYearAgo
  [--popular-investor] \                       # boolean flag
  [--page N] [--page-size N]

# Get user info
etoro-cli social user <username> portfolio     # public portfolio
etoro-cli social user <username> gain          # historical gain
etoro-cli social user <username> tradeinfo     # trade statistics
etoro-cli social user <username> daily-gain    # daily performance

# Get copiers (Popular Investors only)
etoro-cli social copiers
```

### Watchlists

```bash
etoro-cli watchlist list                       # list all
etoro-cli watchlist get <id>                   # get specific
etoro-cli watchlist create <name>              # create new
etoro-cli watchlist delete <id>                # delete
etoro-cli watchlist add-items <id> <ids>       # add instruments (comma-separated)
etoro-cli watchlist remove-items <id> <ids>    # remove instruments
etoro-cli watchlist rename <id> <name>         # rename a watchlist
etoro-cli watchlist rank <id> <rank>           # reorder a watchlist
```

### Feeds

```bash
etoro-cli feed instrument <instrumentId> [--take N] [--offset N]
etoro-cli feed user <userId> [--take N] [--offset N]
etoro-cli feed post --message "text" --owner <userId>
```

### Discovery

```bash
etoro-cli discovery curated                    # curated investment lists
etoro-cli discovery recommendations [--count N] # personalized picks (default: 10)
```

---

## MCP Tools Reference

### Read-only tools

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `get_identity` | Account info | — |
| `search_instruments` | Find instruments | `query`, `filterBy` (symbol/name), `page`, `pageSize` |
| `get_instruments` | Instrument metadata | `instrumentIds` (comma-sep) |
| `get_rates` | Live prices or closing prices | `instrumentIds`, `type` (current/closing_price), `includeNames` (opt-in) |
| `get_candles` | OHLC history | `instrumentId`, `interval`, `count`, `direction` |
| `get_reference_data` | Cached reference data | `type` (instrument_types/exchanges/stocks_industries) |
| `get_market_status` | Check if instruments are tradeable | `symbols` (comma-separated, e.g. "AAPL,BTC") |
| `get_portfolio` | Positions, P&L, order status | `view` (positions/pnl/order), `orderId` |
| `get_trade_history` | Closed trades | `minDate` (YYYY-MM-DD), `page`, `pageSize`, `includeNames` (opt-in) |
| `search_people` | Find traders | `action` (search/lookup), `period`, `isPopularInvestor` |
| `get_user_info` | Trader details | `view` (portfolio/tradeinfo/gain/daily_gain/copiers), `username` |
| `get_discovery` | Curated lists/recommendations | `type`, `count` |
| `get_feeds` | Social feeds | `type` (instrument/user), `id`, `take`, `offset` |

### Write tools

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `open_order` | Market order | `order_type` (by_amount/by_units), `InstrumentID`, `IsBuy`, `Leverage`, `Amount`/`AmountInUnits` |
| `close_position` | Close position | `positionId`, `UnitsToDeduct` (optional partial) |
| `manage_order` | Cancel/limit orders | `action` (cancel_open_order/cancel_close_order/place_limit_order/cancel_limit_order) |
| `create_post` | Post or comment | `action` (post/comment), `message`, `owner`/`postId` |
| `manage_watchlists` | Watchlist CRUD | `action` (list/get/create/delete/rename/add_items/remove_items/...) |
| `manage_agent_portfolios` | Agent portfolio CRUD | `action` (list/create/delete/create_token/revoke_token/update_token) |

### Multiplexed tool pattern

Several tools multiplex many endpoints via an `action` parameter:

```
# manage_watchlists has 15 actions:
manage_watchlists(action: "list")
manage_watchlists(action: "create", name: "My List")
manage_watchlists(action: "add_items", watchlistId: "abc", instrumentIds: "1,2,3")
manage_watchlists(action: "delete", watchlistId: "abc")
```

Always pass the `action` parameter first, then action-specific parameters. Missing required parameters return `isError: true` with a descriptive message.

---

## eToro API Conventions

### Request body field naming

**Trading endpoints use PascalCase:**
```json
{
  "InstrumentID": 1,
  "IsBuy": true,
  "Leverage": 1,
  "Amount": 100,
  "StopLossRate": 145.00,
  "TakeProfitRate": 200.00
}
```

**Feed endpoints use camelCase:**
```json
{
  "message": "Bullish on tech!",
  "owner": 12345,
  "tags": ["tech"],
  "mentions": [67890]
}
```

The MCP tools and CLI handle this mapping — you pass the fields as documented and they're sent in the correct case.

### Pagination — three patterns

Different endpoints use different pagination schemes:

| Pattern | Parameters | Used by |
|---------|-----------|---------|
| `pageNumber` / `pageSize` | 1-indexed page, 1-100 size | Instrument search |
| `page` / `pageSize` | 1-indexed page, 1-100 size | People search, trade history |
| `take` / `offset` | Count + skip | Feeds |

### Demo vs Real path routing

The server routes to different API paths based on the configured environment. The routing is **asymmetric** — not all categories follow the same pattern:

| Category | Demo | Real |
|----------|------|------|
| Trading execution | `/execution/demo/{subpath}` | `/execution/{subpath}` |
| Portfolio | `/info/demo/portfolio` | `/info/portfolio` (no "real" segment) |
| P&L | `/info/demo/pnl` | `/info/real/pnl` |
| Order info | `/info/demo/orders/{id}` | `/info/real/orders/{id}` |

Market data, social, watchlists, feeds, and discovery endpoints are shared — no demo/real distinction.

### Rate limits

| Bucket | Limit | Operations |
|--------|-------|-----------|
| **GET** | 60/min | Market data, portfolio, social, watchlist reads, feeds |
| **WRITE** | 20/min | Trade execution, watchlist mutations, posts |

The client enforces limits proactively with a sliding-window tracker. If a bucket is full, it waits automatically. On HTTP 429, it retries with exponential backoff (1s, 2s, 4s — max 3 attempts).

**Rate limit conservation tips:**
- Use `get_reference_data` for instrument types/exchanges/industries — cached 24h
- Batch instrument IDs in `get_rates` (up to 100 per call) instead of calling one at a time
- Avoid polling in tight loops — space requests by at least 1 second

---

## Error Handling

### CLI errors

Errors are JSON on stderr with exit code 1:
```json
{
  "error": "HTTP 401: Unauthorized",
  "statusCode": 401,
  "errorCode": "Unauthorized",
  "body": { "errorCode": "Unauthorized", "errorMessage": "Unauthorized" }
}
```

### MCP errors

Tool handlers never throw. They return `{ isError: true, content: [{ type: "text", text: "..." }] }`, allowing the AI assistant to handle gracefully.

### Common errors

| Status | Cause | Fix |
|--------|-------|-----|
| 401 | Invalid/expired keys | Regenerate keys in eToro Settings |
| 403 | Read-only key used for write op | Create key with Read+Write permissions |
| 429 | Rate limit exceeded | Automatic retry; reduce request frequency |
| 400 | Invalid parameters | Check parameter types and required fields |

### Missing argument errors

CLI returns descriptive errors for missing required arguments:
```json
{"error": "Missing required argument: <query>"}
{"error": "--instrument is required"}
{"error": "Must specify --buy or --sell"}
```

---

## Best Practices

### Always look up the instrument ID first

Never guess instrument IDs. Always search first:
```bash
etoro-cli market search "NVIDIA" | jq '.items[0].instrumentId'
```
Then use the returned ID in subsequent commands.

### Always set stop-loss on trades

```bash
etoro-cli trade open --instrument 1 --buy --leverage 1 --amount 100 --stop-loss 145
```

### Check portfolio before closing

Verify the position exists and get the correct position ID:
```bash
etoro-cli portfolio positions | jq '.[] | {positionID, instrumentID, symbolFull, isBuy, amount, pnL}'
```

### Batch rate requests

```bash
# Look up IDs first, then batch them in a single call
APPLE_ID=$(etoro-cli market search "Apple" | jq '.items[0].instrumentId')
TESLA_ID=$(etoro-cli market search "Tesla" | jq '.items[0].instrumentId')
MSFT_ID=$(etoro-cli market search "Microsoft" | jq '.items[0].instrumentId')

# GOOD: single call for multiple instruments
etoro-cli market rates "$APPLE_ID,$TESLA_ID,$MSFT_ID"

# BAD: separate calls waste rate limit
etoro-cli market rates "$APPLE_ID"
etoro-cli market rates "$TESLA_ID"
etoro-cli market rates "$MSFT_ID"
```

### Use reference data for lookups

Reference data is cached 24h — safe to call frequently:
```bash
# Map instrument type IDs to names
etoro-cli market ref instrument-types | jq '.[] | {InstrumentTypeID, InstrumentTypeName}'

# Map exchange IDs to names
etoro-cli market ref exchanges | jq '.[] | {ExchangeID, ExchangeName}'
```

### Discovering instrument IDs

**Do NOT hardcode instrument IDs** -- they are not guaranteed stable across environments and may differ between demo and real.

Always use `search_instruments` or the CLI to discover the current instrument ID before any operation:

```bash
# Find an instrument's current ID
etoro-cli market search "Tesla" | jq '.items[0].instrumentId'

# Search by symbol
etoro-cli market search "AAPL" | jq '.items[0].instrumentId'
```
