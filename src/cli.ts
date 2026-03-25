#!/usr/bin/env node

import { EtoroClient } from "./client.js";
import { loadConfig } from "./config.js";
import { createPathResolver } from "./utils/path-resolver.js";
import { EtoroApiError } from "./types/errors.js";
import { flattenCandles, fetchInstrumentsBatch, enrichWithNames } from "./tools/market-data.js";
import { TtlCache } from "./utils/cache.js";
import { flattenPnl, flattenPositions, extractTradeHistoryItems } from "./tools/portfolio.js";
import { lookupInstrumentId } from "./tools/trading.js";
import { formatTable } from "./utils/table-formatter.js";

// --- Arg parsing ---

interface ParsedArgs {
  positional: string[];
  flags: Record<string, string>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  const globalFlags = new Set(["--api-key", "--user-key", "--environment"]);

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx !== -1) {
        flags[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
        flags[arg.slice(2)] = argv[i + 1];
        // Skip next arg unless it's a global flag (handled by config.ts)
        if (!globalFlags.has(arg)) {
          i++;
        }
      } else {
        // Boolean flag
        flags[arg.slice(2)] = "true";
      }
    } else if (!globalFlags.has(argv[i - 1])) {
      positional.push(arg);
    }
    i++;
  }

  return { positional, flags };
}

function flag(flags: Record<string, string>, name: string): string | undefined {
  return flags[name];
}

function flagNum(flags: Record<string, string>, name: string): number | undefined {
  const v = flags[name];
  return v !== undefined ? Number(v) : undefined;
}

function requireArg(args: string[], index: number, name: string): string {
  if (!args[index]) {
    error(`Missing required argument: <${name}>`);
  }
  return args[index];
}

// --- Output ---

let outputFormat: "json" | "table" = "json";

function output(data: unknown): void {
  if (outputFormat === "table") {
    const table = formatTable(data);
    if (table) {
      console.log(table);
      return;
    }
  }
  console.log(JSON.stringify(data, null, 2));
}

function error(message: string): never {
  console.error(JSON.stringify({ error: message }));
  process.exit(1);
}

// --- Help ---

const HELP = `Usage: etoro-cli <command> [subcommand] [args] [options]

Global options:
  --api-key <key>          eToro API key (or ETORO_API_KEY env var)
  --user-key <key>         eToro user key (or ETORO_USER_KEY env var)
  --environment <env>      demo or real (default: demo)
  --verbose                Show rate limit status on each request
  --output <format>        Output format: json (default) or table

Commands:
  identity                           Get authenticated user info

  market search <query>              Search instruments (auto-falls back to name if symbol not found)
  market instrument <ids>            Get instrument metadata (comma-separated IDs)
  market rates <ids>                 Get current rates (comma-separated IDs)
  market candles <id>                Get OHLC candles
    --interval <interval>              OneMinute|FiveMinutes|FifteenMinutes|ThirtyMinutes|
                                       OneHour|FourHours|OneDay|OneWeek (default: OneDay)
    --count <n>                        Number of candles, max 1000 (default: 100)
    --direction <dir>                  asc or desc (default: desc)
  market ref <type>                  Reference data: instrument-types|exchanges|stocks-industries
  market status <symbols>            Check if instruments are tradeable (comma-separated symbols)

  portfolio positions                Current portfolio positions
  portfolio pnl                      Portfolio P&L summary
  portfolio order <orderId>          Order execution status
  portfolio history                  Trade history
    --min-date <YYYY-MM-DD>            Required: earliest date
    --include-names                    Include instrument names (opt-in)

  trade open                         Open market order by amount
    --instrument <id>                  Instrument ID (required)
    --buy | --sell                     Direction (required)
    --leverage <n>                     Leverage multiplier (required)
    --amount <n>                       Cash amount (required)
  trade open-units                   Open market order by units
    --instrument <id>                  Instrument ID (required)
    --buy | --sell                     Direction (required)
    --leverage <n>                     Leverage multiplier (required)
    --units <n>                        Number of units (required)
  trade close <positionId>           Close a position
  trade limit                        Place a limit order
    --instrument <id>                  Instrument ID (required)
    --buy | --sell                     Direction (required)
    --leverage <n>                     Leverage (required)
    --amount <n>                       Cash amount (required)
    --rate <n>                         Limit price (required)
  trade cancel <orderId>             Cancel an open or limit order (auto-detects type)
    --type <type>                      limit or market (optional, auto-detects if omitted)

  social search                      Search/discover traders
    --period <period>                  Required: CurrMonth|CurrYear|LastYear|etc.
    --popular-investor                 Filter: Popular Investors only
    --page <n>                         Page number
    --page-size <n>                    Results per page
  social user <username> <view>      User info: portfolio|gain|tradeinfo|daily-gain
  social copiers                     Get copiers info

  watchlist list                     List all watchlists
  watchlist get <id>                 Get a specific watchlist
  watchlist create <name>            Create a watchlist
  watchlist delete <id>              Delete a watchlist
  watchlist add-items <id> <ids>     Add instruments (comma-separated IDs)
  watchlist remove-items <id> <ids>  Remove instruments (comma-separated IDs)
  watchlist rename <id> <name>       Rename a watchlist
  watchlist rank <id> <rank>         Reorder a watchlist (set position)

  feed instrument <instrumentId>     Instrument social feed
  feed user <userId>                 User social feed
    --take <n>                         Number of posts (default: 20)
    --offset <n>                       Pagination offset (default: 0)
  feed post                          Create a social post
    --message <text>                   Post text (required)
    --owner <userId>                   Owner user ID (required)

  discovery curated                  Curated investment lists
  discovery recommendations          Personalized recommendations
    --count <n>                        Number of items (default: 10)

  rate-limit                         Show current rate limit status

  help                               Show this help message
`;

// --- Main ---

async function main() {
  const { positional, flags: f } = parseArgs(process.argv.slice(2));
  const [command, sub, ...rest] = positional;

  if (!command || command === "help") {
    console.log(HELP);
    return;
  }

  const config = loadConfig();
  const verbose = f["verbose"] === "true";
  const fmt = flag(f, "output");
  if (fmt === "table") outputFormat = "table";
  const client = new EtoroClient(config, { verbose });
  const paths = createPathResolver(config.environment);

  switch (command) {
    case "identity":
      return output(await client.get(paths.identity()));

    case "market":
      switch (sub) {
        case "search": {
          const searchQuery = requireArg(rest, 0, "query");
          const filterBy = flag(f, "filter-by") ?? "symbol";
          const searchPage = flagNum(f, "page") ?? 1;
          const searchPageSize = flagNum(f, "page-size") ?? 20;

          if (filterBy === "symbol") {
            // Server-side exact symbol match
            const symbolResult = await client.get<Record<string, unknown>>(paths.marketData("search"), {
              InternalSymbolFull: searchQuery.toUpperCase(),
              pageNumber: searchPage,
              pageSize: searchPageSize,
            });
            const symbolItems = symbolResult.items as Array<Record<string, unknown>> | undefined;
            if (symbolItems && symbolItems.length > 0) {
              return output(symbolResult);
            }
            // Fall back to name search if symbol returned nothing
          }

          // Server-side name filter via internalInstrumentDisplayName
          return output(await client.get(paths.marketData("search"), {
            internalInstrumentDisplayName: searchQuery,
            pageNumber: searchPage,
            pageSize: searchPageSize,
          }));
        }
        case "instrument": {
          const instrumentCache = new TtlCache<unknown>();
          return output(await fetchInstrumentsBatch(client, paths, requireArg(rest, 0, "ids"), instrumentCache));
        }
        case "rates":
          return output(await client.get(paths.marketData("instruments/rates"), {
            instrumentIds: requireArg(rest, 0, "ids"),
          }));
        case "candles": {
          const id = requireArg(rest, 0, "instrumentId");
          const interval = flag(f, "interval") ?? "OneDay";
          const count = flagNum(f, "count") ?? 100;
          const direction = flag(f, "direction") ?? "desc";
          const raw = await client.get(
            paths.marketData(`instruments/${id}/history/candles/${direction}/${interval}/${count}`),
          );
          return output(flattenCandles(raw));
        }
        case "ref":
          return output(await client.get(paths.marketData(
            requireArg(rest, 0, "type").replace("_", "-"),
          )));
        case "status": {
          const symbols = requireArg(rest, 0, "symbols").split(",").map((s: string) => s.trim().toUpperCase()).filter(Boolean);
          const statuses: Array<Record<string, unknown>> = [];
          for (const symbol of symbols) {
            const result = await client.get<Record<string, unknown>>(paths.marketData("search"), {
              InternalSymbolFull: symbol,
              pageSize: 1,
              pageNumber: 1,
            });
            const items = result.items as Array<Record<string, unknown>> | undefined;
            if (!items || items.length === 0) {
              statuses.push({ symbol, found: false });
              continue;
            }
            const item = items[0];
            statuses.push({
              symbol,
              found: true,
              instrumentId: item.internalInstrumentId ?? item.instrumentId,
              displayName: item.internalInstrumentDisplayName ?? item.instrumentDisplayName,
              isCurrentlyTradable: item.isCurrentlyTradable ?? null,
              isExchangeOpen: item.isExchangeOpen ?? null,
              isBuyEnabled: item.isBuyEnabled ?? null,
              exchangeName: item.internalExchangeName ?? null,
              assetClass: item.internalAssetClassName ?? null,
            });
          }
          return output(statuses);
        }
        default:
          error(`Unknown market subcommand: ${sub}. Try: search, instrument, rates, candles, ref, status`);
      }
      break;

    case "portfolio":
      switch (sub) {
        case "positions":
          return output(flattenPositions(await client.get(paths.portfolio())));
        case "pnl":
          return output(flattenPnl(await client.get(paths.pnl())));
        case "order":
          return output(await client.get(
            paths.orderInfo(requireArg(rest, 0, "orderId")),
          ));
        case "history": {
          const historyResult = await client.get(paths.tradeHistory(), {
            minDate: flag(f, "min-date"),
            page: flagNum(f, "page"),
            pageSize: flagNum(f, "page-size"),
          });
          if (f["include-names"] === "true") {
            const { items, wrapper } = extractTradeHistoryItems(historyResult);
            if (items.length > 0) {
              const historyIds = items
                .map((item) => {
                  if (typeof item !== "object" || item === null) return undefined;
                  const rec = item as Record<string, unknown>;
                  return rec.instrumentID ?? rec.InstrumentID;
                })
                .filter((id) => id !== undefined)
                .map(String);
              if (historyIds.length > 0) {
                try {
                  const uniqueIds = [...new Set(historyIds)].join(",");
                  const historyCache = new TtlCache<unknown>();
                  const enriched = (await enrichWithNames(client, paths, uniqueIds, items, historyCache)) as unknown[];
                  if (wrapper && typeof historyResult === "object" && historyResult !== null) {
                    return output({ ...(historyResult as Record<string, unknown>), [wrapper]: enriched });
                  }
                  return output(enriched);
                } catch {
                  // Best-effort
                }
              }
            }
          }
          return output(historyResult);
        }
        default:
          error(`Unknown portfolio subcommand: ${sub}. Try: positions, pnl, order, history`);
      }
      break;

    case "trade":
      switch (sub) {
        case "open": {
          const isBuy = f["buy"] === "true" ? true : f["sell"] === "true" ? false : undefined;
          if (isBuy === undefined) error("Must specify --buy or --sell");
          const body: Record<string, unknown> = {
            InstrumentID: Number(flag(f, "instrument") ?? error("--instrument is required")),
            IsBuy: isBuy,
            Leverage: Number(flag(f, "leverage") ?? error("--leverage is required")),
            Amount: Number(flag(f, "amount") ?? error("--amount is required")),
          };
          if (flag(f, "stop-loss")) body.StopLossRate = Number(flag(f, "stop-loss"));
          if (flag(f, "take-profit")) body.TakeProfitRate = Number(flag(f, "take-profit"));
          return output(await client.post(paths.trading("market-open-orders/by-amount"), body));
        }
        case "open-units": {
          const isBuy = f["buy"] === "true" ? true : f["sell"] === "true" ? false : undefined;
          if (isBuy === undefined) error("Must specify --buy or --sell");
          const body: Record<string, unknown> = {
            InstrumentID: Number(flag(f, "instrument") ?? error("--instrument is required")),
            IsBuy: isBuy,
            Leverage: Number(flag(f, "leverage") ?? error("--leverage is required")),
            AmountInUnits: Number(flag(f, "units") ?? error("--units is required")),
          };
          if (flag(f, "stop-loss")) body.StopLossRate = Number(flag(f, "stop-loss"));
          if (flag(f, "take-profit")) body.TakeProfitRate = Number(flag(f, "take-profit"));
          return output(await client.post(paths.trading("market-open-orders/by-units"), body));
        }
        case "close": {
          const closePositionId = Number(requireArg(rest, 0, "positionId"));
          let closeInstrumentId = flagNum(f, "instrument");
          if (closeInstrumentId === undefined) {
            const portfolio = await client.get<unknown>(paths.portfolio());
            closeInstrumentId = lookupInstrumentId(portfolio, closePositionId);
            if (closeInstrumentId === undefined) {
              error(`Could not find position ${closePositionId} in portfolio. Use --instrument <id> to specify.`);
            }
          }
          return output(await client.post(
            paths.trading(`market-close-orders/positions/${closePositionId}`),
            { InstrumentID: closeInstrumentId },
          ));
        }
        case "limit": {
          const isBuy = f["buy"] === "true" ? true : f["sell"] === "true" ? false : undefined;
          if (isBuy === undefined) error("Must specify --buy or --sell");
          const body: Record<string, unknown> = {
            InstrumentID: Number(flag(f, "instrument") ?? error("--instrument is required")),
            IsBuy: isBuy,
            Leverage: Number(flag(f, "leverage") ?? error("--leverage is required")),
            Amount: Number(flag(f, "amount") ?? error("--amount is required")),
            Rate: Number(flag(f, "rate") ?? error("--rate is required")),
          };
          if (flag(f, "stop-loss")) body.StopLossRate = Number(flag(f, "stop-loss"));
          if (flag(f, "take-profit")) body.TakeProfitRate = Number(flag(f, "take-profit"));
          return output(await client.post(paths.trading("limit-orders"), body));
        }
        case "cancel": {
          const cancelOrderId = requireArg(rest, 0, "orderId");
          const cancelType = flag(f, "type");
          if (cancelType === "market") {
            return output(await client.delete(paths.trading(`market-open-orders/${cancelOrderId}`)));
          }
          if (cancelType === "limit") {
            return output(await client.delete(paths.trading(`limit-orders/${cancelOrderId}`)));
          }
          // Auto-detect: try limit-orders first (most common cancel case), fall back to market-open-orders
          try {
            return output(await client.delete(paths.trading(`limit-orders/${cancelOrderId}`)));
          } catch (limitErr) {
            try {
              return output(await client.delete(paths.trading(`market-open-orders/${cancelOrderId}`)));
            } catch {
              // Re-throw the original limit error if both fail
              throw limitErr;
            }
          }
        }
        default:
          error(`Unknown trade subcommand: ${sub}. Try: open, open-units, close, limit, cancel`);
      }
      break;

    case "social":
      switch (sub) {
        case "search":
          return output(await client.get(paths.social("people/search"), {
            period: flag(f, "period") ?? error("--period is required"),
            isPopularInvestor: f["popular-investor"] === "true" ? true : undefined,
            page: flagNum(f, "page"),
            pageSize: flagNum(f, "page-size"),
          }));
        case "user": {
          const username = requireArg(rest, 0, "username");
          const view = requireArg(rest, 1, "view");
          const viewMap: Record<string, string> = {
            portfolio: `people/${username}/portfolio/live`,
            gain: `people/${username}/gain`,
            tradeinfo: `people/${username}/tradeinfo`,
            "daily-gain": `people/${username}/daily-gain`,
          };
          const path = viewMap[view];
          if (!path) error(`Unknown view: ${view}. Try: portfolio, gain, tradeinfo, daily-gain`);
          return output(await client.get(paths.social(path)));
        }
        case "copiers":
          return output(await client.get(paths.piData("copiers")));
        default:
          error(`Unknown social subcommand: ${sub}. Try: search, user, copiers`);
      }
      break;

    case "watchlist":
      switch (sub) {
        case "list":
          return output(await client.get(paths.watchlists()));
        case "get":
          return output(await client.get(
            paths.watchlists(requireArg(rest, 0, "watchlistId")),
          ));
        case "create":
          return output(await client.post(paths.watchlists(), {
            name: requireArg(rest, 0, "name"),
          }));
        case "delete":
          return output(await client.delete(
            paths.watchlists(requireArg(rest, 0, "watchlistId")),
          ));
        case "add-items": {
          const wlId = requireArg(rest, 0, "watchlistId");
          const ids = requireArg(rest, 1, "instrumentIds").split(",").map(Number);
          return output(await client.post(paths.watchlists(`${wlId}/items`), ids));
        }
        case "remove-items": {
          const wlId = requireArg(rest, 0, "watchlistId");
          const ids = requireArg(rest, 1, "instrumentIds").split(",").map(Number);
          return output(await client.delete(paths.watchlists(`${wlId}/items`), ids));
        }
        case "rename": {
          const wlId = requireArg(rest, 0, "watchlistId");
          const newName = requireArg(rest, 1, "name");
          return output(await client.put(paths.watchlists(`${wlId}/rename`), { name: newName }));
        }
        case "rank": {
          const wlId = requireArg(rest, 0, "watchlistId");
          const newRank = Number(requireArg(rest, 1, "rank"));
          return output(await client.put(paths.watchlists(`${wlId}/rank`), { rank: newRank }));
        }
        default:
          error(`Unknown watchlist subcommand: ${sub}. Try: list, get, create, delete, add-items, remove-items, rename, rank`);
      }
      break;

    case "feed":
      switch (sub) {
        case "instrument":
          return output(await client.get(paths.feeds(`instrument/${requireArg(rest, 0, "instrumentId")}`), {
            take: flagNum(f, "take") ?? 20,
            offset: flagNum(f, "offset") ?? 0,
          }));
        case "user":
          return output(await client.get(paths.feeds(`user/${requireArg(rest, 0, "userId")}`), {
            take: flagNum(f, "take") ?? 20,
            offset: flagNum(f, "offset") ?? 0,
          }));
        case "post":
          return output(await client.post(paths.feeds("post"), {
            message: flag(f, "message") ?? error("--message is required"),
            owner: Number(flag(f, "owner") ?? error("--owner is required")),
          }));
        default:
          error(`Unknown feed subcommand: ${sub}. Try: instrument, user, post`);
      }
      break;

    case "discovery":
      switch (sub) {
        case "curated":
          return output(await client.get(paths.discovery("curated-lists")) ?? []);
        case "recommendations": {
          const discoveryResult = await client.get(
            paths.discovery(`market-recommendations/${flagNum(f, "count") ?? 10}`),
          );
          return output(discoveryResult ?? { recommendations: [], message: "No recommendations available for this account." });
        }
        default:
          error(`Unknown discovery subcommand: ${sub}. Try: curated, recommendations`);
      }
      break;

    case "rate-limit": {
      const status = client.getRateLimitStatus();
      return output({
        GET: { remaining: status.GET.remaining, limit: status.GET.limit, resetInSeconds: Math.ceil(status.GET.resetInMs / 1000) },
        WRITE: { remaining: status.WRITE.remaining, limit: status.WRITE.limit, resetInSeconds: Math.ceil(status.WRITE.resetInMs / 1000) },
      });
    }

    default:
      error(`Unknown command: ${command}. Run 'etoro-cli help' for usage.`);
  }
}

main().catch((err) => {
  if (err instanceof EtoroApiError) {
    console.error(JSON.stringify({
      error: err.message,
      statusCode: err.statusCode,
      errorCode: err.errorCode,
      body: err.body,
    }, null, 2));
  } else {
    console.error(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
  }
  process.exit(1);
});
