import { ConfigSchema, type EtoroConfig } from "./types/config.js";

function parseCliArgs(argv: readonly string[]): Record<string, string> {
  const args: Record<string, string> = {};
  const flags = ["--api-key", "--user-key", "--environment"] as const;

  for (let i = 0; i < argv.length; i++) {
    for (const flag of flags) {
      if (argv[i] === flag && i + 1 < argv.length) {
        args[flag] = argv[i + 1];
        i++;
        break;
      }

      if (argv[i].startsWith(`${flag}=`)) {
        args[flag] = argv[i].slice(flag.length + 1);
        break;
      }
    }
  }

  return args;
}

export function loadConfig(): EtoroConfig {
  const cliArgs = parseCliArgs(process.argv);

  const raw = {
    apiKey: cliArgs["--api-key"] ?? process.env.ETORO_API_KEY ?? "",
    userKey: cliArgs["--user-key"] ?? process.env.ETORO_USER_KEY ?? "",
    environment:
      cliArgs["--environment"] ?? process.env.ETORO_ENVIRONMENT ?? undefined,
  };

  try {
    return ConfigSchema.parse(raw);
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      const zodError = error as unknown as { issues: Array<{ message: string; path: (string | number)[] }> };
      const messages = zodError.issues
        .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
        .join("\n");
      throw new Error(`Invalid configuration:\n${messages}`, { cause: error });
    }
    throw error;
  }
}
