export type Environment = "demo" | "real";

const BASE = "/api/v1";

export interface PathResolver {
  trading(subpath: string): string;
  portfolio(): string;
  pnl(): string;
  orderInfo(orderId: string | number): string;
  tradeHistory(): string;
  marketData(subpath: string): string;
  social(subpath: string): string;
  watchlists(subpath?: string): string;
  feeds(subpath: string): string;
  identity(): string;
  discovery(subpath: string): string;
  piData(subpath: string): string;
  agentPortfolios(subpath?: string): string;
  reactions(subpath: string): string;
}

export function createPathResolver(env: Environment): PathResolver {
  return {
    trading(subpath: string): string {
      // demo = /api/v1/trading/execution/demo/{subpath}
      // real  = /api/v1/trading/execution/{subpath}
      return env === "demo"
        ? `${BASE}/trading/execution/demo/${subpath}`
        : `${BASE}/trading/execution/${subpath}`;
    },

    portfolio(): string {
      // demo = /api/v1/trading/info/demo/portfolio
      // real  = /api/v1/trading/info/portfolio (NO "real" segment)
      return env === "demo"
        ? `${BASE}/trading/info/demo/portfolio`
        : `${BASE}/trading/info/portfolio`;
    },

    pnl(): string {
      // demo = /api/v1/trading/info/demo/pnl
      // real  = /api/v1/trading/info/real/pnl
      return env === "demo"
        ? `${BASE}/trading/info/demo/pnl`
        : `${BASE}/trading/info/real/pnl`;
    },

    orderInfo(orderId: string | number): string {
      // demo = /api/v1/trading/info/demo/orders/{orderId}
      // real  = /api/v1/trading/info/real/orders/{orderId}
      const segment = env === "demo" ? "demo" : "real";
      return `${BASE}/trading/info/${segment}/orders/${orderId}`;
    },

    tradeHistory(): string {
      // shared, no demo/real distinction
      return `${BASE}/trading/info/trade/history`;
    },

    marketData(subpath: string): string {
      return `${BASE}/market-data/${subpath}`;
    },

    social(subpath: string): string {
      return `${BASE}/user-info/${subpath}`;
    },

    watchlists(subpath?: string): string {
      return subpath ? `${BASE}/watchlists/${subpath}` : `${BASE}/watchlists`;
    },

    feeds(subpath: string): string {
      return `${BASE}/feeds/${subpath}`;
    },

    identity(): string {
      return `${BASE}/me`;
    },

    discovery(subpath: string): string {
      return `${BASE}/${subpath}`;
    },

    piData(subpath: string): string {
      return `${BASE}/pi-data/${subpath}`;
    },

    agentPortfolios(subpath?: string): string {
      return subpath
        ? `${BASE}/agent-portfolios/${subpath}`
        : `${BASE}/agent-portfolios`;
    },

    reactions(subpath: string): string {
      return `${BASE}/reactions/${subpath}`;
    },
  };
}
