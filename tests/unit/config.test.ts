import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadConfig } from "../../src/config.js";

describe("loadConfig", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    // Reset process.argv to a clean state
    process.argv = ["node", "index.js"];
  });

  it("loads config from environment variables", () => {
    vi.stubEnv("ETORO_API_KEY", "env-api-key");
    vi.stubEnv("ETORO_USER_KEY", "env-user-key");
    vi.stubEnv("ETORO_ENVIRONMENT", "real");

    const config = loadConfig();

    expect(config).toEqual({
      apiKey: "env-api-key",
      userKey: "env-user-key",
      environment: "real",
    });
  });

  it("defaults environment to demo when not specified", () => {
    vi.stubEnv("ETORO_API_KEY", "key");
    vi.stubEnv("ETORO_USER_KEY", "user");
    delete process.env.ETORO_ENVIRONMENT;

    const config = loadConfig();

    expect(config.environment).toBe("demo");
  });

  it("throws on missing ETORO_API_KEY", () => {
    vi.stubEnv("ETORO_USER_KEY", "user");
    delete process.env.ETORO_API_KEY;

    expect(() => loadConfig()).toThrow("Invalid configuration");
  });

  it("throws on missing ETORO_USER_KEY", () => {
    vi.stubEnv("ETORO_API_KEY", "key");
    delete process.env.ETORO_USER_KEY;

    expect(() => loadConfig()).toThrow("Invalid configuration");
  });

  it("CLI --api-key=value overrides env var", () => {
    vi.stubEnv("ETORO_API_KEY", "env-key");
    vi.stubEnv("ETORO_USER_KEY", "user");
    process.argv = ["node", "index.js", "--api-key=cli-key"];

    const config = loadConfig();

    expect(config.apiKey).toBe("cli-key");
  });

  it("CLI --api-key value (space-separated) overrides env var", () => {
    vi.stubEnv("ETORO_API_KEY", "env-key");
    vi.stubEnv("ETORO_USER_KEY", "user");
    process.argv = ["node", "index.js", "--api-key", "cli-key"];

    const config = loadConfig();

    expect(config.apiKey).toBe("cli-key");
  });

  it("CLI --user-key overrides env var", () => {
    vi.stubEnv("ETORO_API_KEY", "key");
    vi.stubEnv("ETORO_USER_KEY", "env-user");
    process.argv = ["node", "index.js", "--user-key=cli-user"];

    const config = loadConfig();

    expect(config.userKey).toBe("cli-user");
  });

  it("CLI --environment overrides env var", () => {
    vi.stubEnv("ETORO_API_KEY", "key");
    vi.stubEnv("ETORO_USER_KEY", "user");
    vi.stubEnv("ETORO_ENVIRONMENT", "demo");
    process.argv = ["node", "index.js", "--environment", "real"];

    const config = loadConfig();

    expect(config.environment).toBe("real");
  });

  it("all CLI args override all env vars", () => {
    vi.stubEnv("ETORO_API_KEY", "env-key");
    vi.stubEnv("ETORO_USER_KEY", "env-user");
    vi.stubEnv("ETORO_ENVIRONMENT", "demo");
    process.argv = [
      "node",
      "index.js",
      "--api-key=cli-key",
      "--user-key=cli-user",
      "--environment=real",
    ];

    const config = loadConfig();

    expect(config).toEqual({
      apiKey: "cli-key",
      userKey: "cli-user",
      environment: "real",
    });
  });

  it("throws on invalid environment value", () => {
    vi.stubEnv("ETORO_API_KEY", "key");
    vi.stubEnv("ETORO_USER_KEY", "user");
    vi.stubEnv("ETORO_ENVIRONMENT", "staging");

    expect(() => loadConfig()).toThrow("Invalid configuration");
  });
});
