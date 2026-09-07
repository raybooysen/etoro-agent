import { describe, it, expect, vi } from "vitest";
import { registerIdentityTools } from "../../../src/tools/identity.js";
import { createMockServer, createMockClient, demoPaths } from "../../helpers/mock-mcp.js";

describe("get_identity handler", () => {
  it("returns the client's identity as JSON content", async () => {
    const client = createMockClient({
      get: vi.fn().mockResolvedValue({ username: "trader1", cid: 12345 }),
    });
    const { tool, handlers } = createMockServer();
    registerIdentityTools(tool as any, client, demoPaths);

    const handler = handlers.get("get_identity")!;
    const result = await handler({});

    expect(client.get).toHaveBeenCalledWith(demoPaths.identity());
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toEqual({ username: "trader1", cid: 12345 });
  });

  it("returns errorContent when the client throws", async () => {
    const client = createMockClient({
      get: vi.fn().mockRejectedValue(new Error("401 Unauthorized")),
    });
    const { tool, handlers } = createMockServer();
    registerIdentityTools(tool as any, client, demoPaths);

    const result = await handlers.get("get_identity")!({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to get identity: 401 Unauthorized");
  });
});
