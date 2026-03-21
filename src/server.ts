import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { EtoroClient } from "./client.js";
import { createPathResolver } from "./utils/path-resolver.js";
import { loadConfig } from "./config.js";
import { registerIdentityTools } from "./tools/identity.js";
import { registerMarketDataTools } from "./tools/market-data.js";
import { registerTradingTools } from "./tools/trading.js";
import { registerPortfolioTools } from "./tools/portfolio.js";
import { registerSocialTools } from "./tools/social.js";
import { registerWatchlistTools } from "./tools/watchlists.js";
import { registerDiscoveryTools } from "./tools/discovery.js";
import { registerFeedTools } from "./tools/feeds.js";
import { registerAgentPortfolioTools } from "./tools/agent-portfolios.js";

export function createServer() {
  const config = loadConfig();
  const paths = createPathResolver(config.environment);
  const client = new EtoroClient(config);

  const server = new McpServer({
    name: "etoro-agent",
    version: "1.0.0",
  });

  registerIdentityTools(server, client, paths);
  registerMarketDataTools(server, client, paths);
  registerTradingTools(server, client, paths);
  registerPortfolioTools(server, client, paths);
  registerSocialTools(server, client, paths);
  registerWatchlistTools(server, client, paths);
  registerDiscoveryTools(server, client, paths);
  registerFeedTools(server, client, paths);
  registerAgentPortfolioTools(server, client, paths);

  return server;
}
