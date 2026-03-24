import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { EtoroClient } from "../client.js";
import type { PathResolver } from "../utils/path-resolver.js";
import { jsonContent, errorContent } from "../utils/formatters.js";

/** Look up InstrumentID for a position from the portfolio response. */
export function lookupInstrumentId(portfolio: unknown, positionId: number): number | undefined {
  if (typeof portfolio !== "object" || portfolio === null) return undefined;
  const obj = portfolio as Record<string, unknown>;

  // API returns { clientPortfolio: { positions: [...] } } — unwrap if needed
  const clientPortfolio = (obj.clientPortfolio ?? obj.ClientPortfolio) as Record<string, unknown> | undefined;
  const source = clientPortfolio ?? obj;

  let positions: unknown[];
  if (Array.isArray(portfolio)) {
    positions = portfolio;
  } else if (Array.isArray((source as Record<string, unknown>).positions)) {
    positions = (source as Record<string, unknown>).positions as unknown[];
  } else if (Array.isArray((source as Record<string, unknown>).Positions)) {
    positions = (source as Record<string, unknown>).Positions as unknown[];
  } else {
    return undefined;
  }

  for (const pos of positions) {
    if (typeof pos !== "object" || pos === null) continue;
    const p = pos as Record<string, unknown>;
    const pid = p.positionID ?? p.PositionID ?? p.positionId;
    if (Number(pid) === positionId) {
      const iid = p.instrumentID ?? p.InstrumentID ?? p.instrumentId;
      return iid !== undefined ? Number(iid) : undefined;
    }
  }
  return undefined;
}

export function registerTradingTools(
  server: McpServer,
  client: EtoroClient,
  paths: PathResolver,
): void {
  server.tool(
    "open_order",
    "Open a new trading position (market order by amount or units)",
    {
      order_type: z.enum(["by_amount", "by_units"]).describe("Order type: 'by_amount' for cash amount, 'by_units' for unit count"),
      InstrumentID: z.number().int().positive().describe("Instrument ID to trade"),
      IsBuy: z.boolean().describe("true = Buy (long), false = Sell (short)"),
      Leverage: z.number().int().positive().describe("Leverage multiplier"),
      Amount: z.number().positive().optional().describe("Cash amount (required for by_amount)"),
      AmountInUnits: z.number().positive().optional().describe("Number of units (required for by_units)"),
      StopLossRate: z.number().positive().optional().describe("Stop loss rate"),
      TakeProfitRate: z.number().positive().optional().describe("Take profit rate"),
      IsTslEnabled: z.boolean().optional().describe("Enable trailing stop loss"),
      IsNoStopLoss: z.boolean().optional().describe("No stop loss"),
      IsNoTakeProfit: z.boolean().optional().describe("No take profit"),
    },
    async (args) => {
      try {
        const { order_type, Amount, AmountInUnits, ...rest } = args;

        if (order_type === "by_amount" && Amount === undefined) {
          return errorContent("Amount is required for order_type 'by_amount'");
        }
        if (order_type === "by_units" && AmountInUnits === undefined) {
          return errorContent("AmountInUnits is required for order_type 'by_units'");
        }

        const subpath = order_type === "by_amount"
          ? "market-open-orders/by-amount"
          : "market-open-orders/by-units";

        const body = order_type === "by_amount"
          ? { ...rest, Amount }
          : { ...rest, AmountInUnits };

        const result = await client.post(paths.trading(subpath), body);
        return jsonContent(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return errorContent(`Failed to open order: ${message}`);
      }
    },
  );

  server.tool(
    "close_position",
    "Close an open trading position at market rate",
    {
      positionId: z.number().int().positive().describe("Position ID to close"),
      InstrumentID: z.number().int().positive().optional().describe("Instrument ID (optional)"),
      UnitsToDeduct: z.number().positive().optional().describe("Partial close: number of units to close"),
    },
    async ({ positionId, InstrumentID, UnitsToDeduct }) => {
      try {
        let instrumentId = InstrumentID;

        // Auto-lookup InstrumentID from portfolio if not provided
        if (instrumentId === undefined) {
          const portfolio = await client.get<unknown>(paths.portfolio());
          instrumentId = lookupInstrumentId(portfolio, positionId);
          if (instrumentId === undefined) {
            return errorContent(`Could not find position ${positionId} in portfolio. Provide InstrumentID explicitly.`);
          }
        }

        const body: Record<string, unknown> = { InstrumentID: instrumentId };
        if (UnitsToDeduct !== undefined) body.UnitsToDeduct = UnitsToDeduct;

        const result = await client.post(
          paths.trading(`market-close-orders/positions/${positionId}`),
          body,
        );
        return jsonContent(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return errorContent(`Failed to close position: ${message}`);
      }
    },
  );

  server.tool(
    "manage_order",
    "Manage orders: cancel open/close market orders, place/cancel limit orders",
    {
      action: z.enum([
        "cancel_open_order",
        "cancel_close_order",
        "place_limit_order",
        "cancel_limit_order",
      ]).describe("Action to perform"),
      orderId: z.number().int().positive().optional().describe("Order ID (required for cancel actions)"),
      InstrumentID: z.number().int().positive().optional().describe("Instrument ID (required for limit orders)"),
      IsBuy: z.boolean().optional().describe("Buy or sell (required for limit orders)"),
      Leverage: z.number().int().positive().optional().describe("Leverage (required for limit orders)"),
      Amount: z.number().positive().optional().describe("Cash amount (for limit orders)"),
      AmountInUnits: z.number().positive().optional().describe("Units (for limit orders)"),
      Rate: z.number().positive().optional().describe("Limit price (required for limit orders)"),
      StopLossRate: z.number().positive().optional().describe("Stop loss rate"),
      TakeProfitRate: z.number().positive().optional().describe("Take profit rate"),
      IsTslEnabled: z.boolean().optional().describe("Enable trailing stop loss"),
      IsNoStopLoss: z.boolean().optional().describe("No stop loss"),
      IsNoTakeProfit: z.boolean().optional().describe("No take profit"),
    },
    async (args) => {
      try {
        const { action, orderId } = args;

        switch (action) {
          case "cancel_open_order": {
            if (orderId === undefined) return errorContent("orderId is required for cancel_open_order");
            const result = await client.delete(paths.trading(`market-open-orders/${orderId}`));
            return jsonContent(result);
          }
          case "cancel_close_order": {
            if (orderId === undefined) return errorContent("orderId is required for cancel_close_order");
            const result = await client.delete(paths.trading(`market-close-orders/${orderId}`));
            return jsonContent(result);
          }
          case "place_limit_order": {
            const { InstrumentID, IsBuy, Leverage, Rate } = args;
            if (!InstrumentID || IsBuy === undefined || !Leverage || !Rate) {
              return errorContent("InstrumentID, IsBuy, Leverage, and Rate are required for place_limit_order");
            }
            const body: Record<string, unknown> = {
              InstrumentID, IsBuy, Leverage, Rate,
            };
            if (args.Amount !== undefined) body.Amount = args.Amount;
            if (args.AmountInUnits !== undefined) body.AmountInUnits = args.AmountInUnits;
            if (args.StopLossRate !== undefined) body.StopLossRate = args.StopLossRate;
            if (args.TakeProfitRate !== undefined) body.TakeProfitRate = args.TakeProfitRate;
            if (args.IsTslEnabled !== undefined) body.IsTslEnabled = args.IsTslEnabled;
            if (args.IsNoStopLoss !== undefined) body.IsNoStopLoss = args.IsNoStopLoss;
            if (args.IsNoTakeProfit !== undefined) body.IsNoTakeProfit = args.IsNoTakeProfit;
            const result = await client.post(paths.trading("limit-orders"), body);
            return jsonContent(result);
          }
          case "cancel_limit_order": {
            if (orderId === undefined) return errorContent("orderId is required for cancel_limit_order");
            const result = await client.delete(paths.trading(`limit-orders/${orderId}`));
            return jsonContent(result);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return errorContent(`Failed to manage order: ${message}`);
      }
    },
  );
}
