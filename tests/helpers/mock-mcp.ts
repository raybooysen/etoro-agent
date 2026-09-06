import { vi } from "vitest";
import type { EtoroClient } from "../../src/client.js";
import { createPathResolver } from "../../src/utils/path-resolver.js";

type ToolHandler = (args: any) => Promise<unknown>;

export interface MockServer {
  tool: ReturnType<typeof vi.fn>;
  handlers: Map<string, ToolHandler>;
}

/**
 * A fake McpServer that captures every `server.tool(name, description, schema, handler)`
 * call so tests can invoke the handler directly, without spinning up a real MCP transport.
 */
export function createMockServer(): MockServer {
  const handlers = new Map<string, ToolHandler>();
  const tool = vi.fn(
    (name: string, _description: string, _schema: unknown, handler: ToolHandler) => {
      handlers.set(name, handler);
    },
  );
  return { tool, handlers } as unknown as MockServer;
}

type ClientMethod = "get" | "post" | "put" | "patch" | "delete";

/** A fake EtoroClient with all HTTP verbs stubbed as vi.fn(). Pass overrides to set return values. */
export function createMockClient(
  overrides: Partial<Record<ClientMethod, ReturnType<typeof vi.fn>>> = {},
): EtoroClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  } as unknown as EtoroClient;
}

export const demoPaths = createPathResolver("demo");
export const realPaths = createPathResolver("real");
