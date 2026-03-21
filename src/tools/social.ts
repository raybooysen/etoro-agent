import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { EtoroClient } from "../client.js";
import type { PathResolver } from "../utils/path-resolver.js";
import { jsonContent, errorContent } from "../utils/formatters.js";

export function registerSocialTools(
  server: McpServer,
  client: EtoroClient,
  paths: PathResolver,
): void {
  server.tool(
    "search_people",
    "Search for eToro users/traders or look up specific users by username or CID",
    {
      action: z.enum(["search", "lookup"]).describe("'search' for discovery search, 'lookup' for specific user(s)"),
      // Search params
      period: z.string().optional().describe("Time period for search (e.g. 'CurrMonth', 'CurrYear', 'LastYear')"),
      page: z.number().int().positive().optional().describe("Page number"),
      pageSize: z.number().int().min(1).max(100).optional().describe("Results per page"),
      // Lookup params
      usernames: z.string().optional().describe("Comma-separated usernames (for lookup)"),
      cidList: z.string().optional().describe("Comma-separated CIDs (for lookup)"),
      // Search filter params
      isPopularInvestor: z.boolean().optional().describe("Filter: Popular Investors only"),
      minGain: z.number().optional().describe("Filter: minimum gain percentage"),
      maxRiskScore: z.number().int().min(1).max(10).optional().describe("Filter: maximum risk score (1-10)"),
      minCopiers: z.number().int().optional().describe("Filter: minimum number of copiers"),
    },
    async (args) => {
      try {
        if (args.action === "lookup") {
          if (!args.usernames && !args.cidList) {
            return errorContent("Either usernames or cidList is required for lookup");
          }
          const params: Record<string, string | undefined> = {};
          if (args.usernames) params.usernames = args.usernames;
          if (args.cidList) params.cidList = args.cidList;
          const result = await client.get(paths.social("people"), params);
          return jsonContent(result);
        }

        // Discovery search
        if (!args.period) {
          return errorContent("period is required for search (e.g. 'CurrMonth', 'CurrYear')");
        }
        const params: Record<string, string | number | boolean | undefined> = {
          period: args.period,
          page: args.page,
          pageSize: args.pageSize,
          isPopularInvestor: args.isPopularInvestor,
          "dailyGain.Min": args.minGain,
          "maxDailyRiskScore.Max": args.maxRiskScore,
          "copiers.Min": args.minCopiers,
        };
        const result = await client.get(paths.social("people/search"), params);
        return jsonContent(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return errorContent(`Failed to search people: ${message}`);
      }
    },
  );

  server.tool(
    "get_user_info",
    "Get detailed info about an eToro user: portfolio, trade info, gain history, or copiers",
    {
      view: z.enum(["portfolio", "tradeinfo", "gain", "daily_gain", "copiers"]).describe("Info type to retrieve"),
      username: z.string().optional().describe("Username (required for portfolio, tradeinfo, gain, daily_gain)"),
      period: z.string().optional().describe("Period for tradeinfo (e.g. 'CurrYear')"),
      minDate: z.string().optional().describe("Min date for daily_gain (YYYY-MM-DD)"),
      maxDate: z.string().optional().describe("Max date for daily_gain (YYYY-MM-DD)"),
      type: z.enum(["Daily", "Period"]).optional().describe("Granularity for daily_gain"),
    },
    async (args) => {
      try {
        switch (args.view) {
          case "portfolio": {
            if (!args.username) return errorContent("username is required for portfolio view");
            const result = await client.get(paths.social(`people/${args.username}/portfolio/live`));
            return jsonContent(result);
          }
          case "tradeinfo": {
            if (!args.username) return errorContent("username is required for tradeinfo view");
            const params: Record<string, string | undefined> = { period: args.period };
            const result = await client.get(paths.social(`people/${args.username}/tradeinfo`), params);
            return jsonContent(result);
          }
          case "gain": {
            if (!args.username) return errorContent("username is required for gain view");
            const result = await client.get(paths.social(`people/${args.username}/gain`));
            return jsonContent(result);
          }
          case "daily_gain": {
            if (!args.username) return errorContent("username is required for daily_gain view");
            const params: Record<string, string | undefined> = {
              minDate: args.minDate,
              maxDate: args.maxDate,
              type: args.type,
            };
            const result = await client.get(paths.social(`people/${args.username}/daily-gain`), params);
            return jsonContent(result);
          }
          case "copiers": {
            const result = await client.get(paths.piData("copiers"));
            return jsonContent(result);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return errorContent(`Failed to get user info: ${message}`);
      }
    },
  );
}
