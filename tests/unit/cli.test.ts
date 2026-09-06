import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseArgs } from "../../src/cli.js";

describe("parseArgs", () => {
  it("splits positional args from flags", () => {
    const { positional, flags } = parseArgs(["market", "search", "AAPL", "--filter-by", "symbol"]);
    expect(positional).toEqual(["market", "search", "AAPL"]);
    expect(flags).toEqual({ "filter-by": "symbol" });
  });

  it("supports --flag=value syntax", () => {
    const { flags } = parseArgs(["identity", "--output=table"]);
    expect(flags).toEqual({ output: "table" });
  });

  it("treats a trailing flag with no value as boolean true", () => {
    const { flags } = parseArgs(["identity", "--verbose"]);
    expect(flags).toEqual({ verbose: "true" });
  });

  it("does not treat a global flag's value as positional", () => {
    const { positional, flags } = parseArgs(["--api-key", "abc123", "identity"]);
    expect(positional).toEqual(["identity"]);
    expect(flags).toEqual({ "api-key": "abc123" });
  });
});

vi.mock("../../src/client.js", () => {
  // A `function` expression (not an arrow function) is required here: vitest's
  // mock functions reject `new` on a mock whose implementation is an arrow
  // function, since arrow functions have no [[Construct]] internal method.
  const EtoroClient = vi.fn().mockImplementation(function () {
    return {
      get: vi.fn().mockResolvedValue({ mocked: true }),
      post: vi.fn().mockResolvedValue({ mocked: true }),
      put: vi.fn().mockResolvedValue({ mocked: true }),
      patch: vi.fn().mockResolvedValue({ mocked: true }),
      delete: vi.fn().mockResolvedValue({ mocked: true }),
    };
  });
  return { EtoroClient };
});

describe("main() command dispatch", () => {
  const originalArgv = process.argv;
  const originalEnv = { ...process.env };
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    process.env.ETORO_API_KEY = "test-key";
    process.env.ETORO_USER_KEY = "test-user";
    process.env.ETORO_ENVIRONMENT = "demo";
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // Throw rather than no-op: src/cli.ts's error() helper relies on process.exit
    // actually halting execution (e.g. requireArg() falls through to use the
    // missing argument if exit doesn't stop the call stack), matching real
    // process.exit(1) behavior. Callers below swallow this sentinel.
    exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as unknown as typeof process.exit);
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env = { ...originalEnv };
    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("prints help with no command", async () => {
    process.argv = ["node", "cli.js"];
    const { main } = await import("../../src/cli.js");
    await main();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Usage: etoro-cli"));
  });

  it("dispatches the identity command", async () => {
    process.argv = ["node", "cli.js", "identity"];
    const { main } = await import("../../src/cli.js");
    await main();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"mocked": true'));
  });

  it("errors on an unknown market subcommand", async () => {
    process.argv = ["node", "cli.js", "market", "bogus"];
    const { main } = await import("../../src/cli.js");
    await main().catch(() => {});
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Unknown market subcommand: bogus"));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("errors when a required positional argument is missing", async () => {
    process.argv = ["node", "cli.js", "market", "search"];
    const { main } = await import("../../src/cli.js");
    await main().catch(() => {});
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Missing required argument: <query>"));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("renders table output when --output=table is passed", async () => {
    process.argv = ["node", "cli.js", "identity", "--output=table"];
    const { main } = await import("../../src/cli.js");
    await main();
    // { mocked: true } is a single object, not an array of objects, so formatTable
    // returns null and main() falls back to JSON — assert that fallback happened.
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"mocked": true'));
  });
});
