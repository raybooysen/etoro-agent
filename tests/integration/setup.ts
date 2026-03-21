import { config } from "dotenv";
import { EtoroClient } from "../../src/client.js";
import { createPathResolver, type PathResolver } from "../../src/utils/path-resolver.js";
import type { EtoroConfig } from "../../src/types/config.js";

// Load .env from project root
config();

export function getTestConfig(): EtoroConfig | null {
  const apiKey = process.env.ETORO_API_KEY;
  const userKey = process.env.ETORO_USER_KEY;

  if (!apiKey || !userKey) {
    return null;
  }

  return {
    apiKey,
    userKey,
    environment: (process.env.ETORO_ENVIRONMENT as "demo" | "real") ?? "demo",
  };
}

export function createTestClient(): { client: EtoroClient; paths: PathResolver } | null {
  const testConfig = getTestConfig();
  if (!testConfig) return null;

  const client = new EtoroClient(testConfig);
  const paths = createPathResolver(testConfig.environment);

  return { client, paths };
}

export function skipIfNoCredentials() {
  const testConfig = getTestConfig();
  if (!testConfig) {
    console.log("⏭ Skipping integration tests: ETORO_API_KEY and ETORO_USER_KEY not set in .env");
    return true;
  }
  return false;
}
