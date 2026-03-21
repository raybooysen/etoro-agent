#!/usr/bin/env node

import { EtoroClient } from "./client.js";
import { loadConfig } from "./config.js";
import { createPathResolver } from "./utils/path-resolver.js";
import { EtoroApiError } from "./types/errors.js";

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

function output(data: unknown): void {
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

Commands:
  identity                           Get authenticated user info

  market search <query>              Search instruments
  market instrument <ids>            Get instrument metadata (comma-separated IDs)
  market rates <ids>                 Get current rates (comma-separated IDs)
  market candles <id>                Get OHLC candles
    --interval <interval>              OneMinute|FiveMinutes|FifteenMinutes|ThirtyMinutes|
                                       OneHour|FourHours|OneDay|OneWeek (default: OneDay)
    --count <n>                        Number of candles, max 1000 (default: 100)
    --direction <dir>                  asc or desc (default: desc)
  market ref <type>                  Reference data: instrument-types|exchanges|stocks-industries

  portfolio positions                Current portfolio positions
  portfolio pnl                      Portfolio P&L summary
  portfolio order <orderId>          Order execution status
  portfolio history                  Trade history
    --min-date <YYYY-MM-DD>            Required: earliest date

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
  trade cancel <orderId>             Cancel an open or limit order

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

  feed instrument <marketId>         Instrument social feed
  feed user <userId>                 User social feed
    --take <n>                         Number of posts (default: 20)
    --offset <n>                       Pagination offset (default: 0)
  feed post                          Create a social post
    --message <text>                   Post text (required)
    --owner <userId>                   Owner user ID (required)

  discovery curated                  Curated investment lists
  discovery recommendations          Personalized recommendations
    --count <n>                        Number of items (default: 10)

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
  const client = new EtoroClient(config);
  const paths = createPathResolver(config.environment);

  switch (command) {
    case "identity":
      return output(await client.get(paths.identity()));

    case "market":
      switch (sub) {
        case "search":
          return output(await client.get(paths.marketData("search"), {
            fields: "InternalSymbolFull,SymbolFull,InstrumentDisplayName,InstrumentTypeID,ExchangeID,InstrumentID",
            searchText: requireArg(rest, 0, "query"),
            pageNumber: flagNum(f, "page") ?? 1,
            pageSize: flagNum(f, "page-size") ?? 20,
          }));
        case "instrument":
          return output(await client.get(paths.marketData("instruments"), {
            instrumentIds: requireArg(rest, 0, "ids"),
          }));
        case "rates":
          return output(await client.get(paths.marketData("instruments/rates"), {
            instrumentIds: requireArg(rest, 0, "ids"),
          }));
        case "candles": {
          const id = requireArg(rest, 0, "instrumentId");
          const interval = flag(f, "interval") ?? "OneDay";
          const count = flagNum(f, "count") ?? 100;
          const direction = flag(f, "direction") ?? "desc";
          return output(await client.get(
            paths.marketData(`instruments/${id}/history/candles/${direction}/${interval}/${count}`),
          ));
        }
        case "ref":
          return output(await client.get(paths.marketData(
            requireArg(rest, 0, "type").replace("_", "-"),
          )));
        default:
          error(`Unknown market subcommand: ${sub}. Try: search, instrument, rates, candles, ref`);
      }
      break;

    case "portfolio":
      switch (sub) {
        case "positions":
          return output(await client.get(paths.portfolio()));
        case "pnl":
          return output(await client.get(paths.pnl()));
        case "order":
          return output(await client.get(
            paths.orderInfo(requireArg(rest, 0, "orderId")),
          ));
        case "history":
          return output(await client.get(paths.tradeHistory(), {
            minDate: flag(f, "min-date"),
            page: flagNum(f, "page"),
            pageSize: flagNum(f, "page-size"),
          }));
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
        case "close":
          return output(await client.post(
            paths.trading(`market-close-orders/positions/${requireArg(rest, 0, "positionId")}`),
          ));
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
        case "cancel":
          return output(await client.delete(
            paths.trading(`market-open-orders/${requireArg(rest, 0, "orderId")}`),
          ));
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
        default:
          error(`Unknown watchlist subcommand: ${sub}. Try: list, get, create, delete, add-items, remove-items`);
      }
      break;

    case "feed":
      switch (sub) {
        case "instrument":
          return output(await client.get(paths.feeds(`instrument/${requireArg(rest, 0, "marketId")}`), {
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
          return output(await client.get(paths.discovery("curated-lists")));
        case "recommendations":
          return output(await client.get(
            paths.discovery(`market-recommendations/${flagNum(f, "count") ?? 10}`),
          ));
        default:
          error(`Unknown discovery subcommand: ${sub}. Try: curated, recommendations`);
      }
      break;

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
