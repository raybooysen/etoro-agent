// tests/unit/tools/discovery.test.ts
import { describe, it, expect, vi } from "vitest";
import { registerDiscoveryTools } from "../../../src/tools/discovery.js";
import { createMockServer, createMockClient, demoPaths } from "../../helpers/mock-mcp.js";

describe("get_discovery handler", () => {
  it("fetches curated lists when type is curated_lists", async () => {
    const client = createMockClient({ get: vi.fn().mockResolvedValue([{ id: "top-movers" }]) });
    const { tool, handlers } = createMockServer();
    registerDiscoveryTools(tool as any, client, demoPaths);

    const result = await handlers.get("get_discovery")!({ type: "curated_lists", count: 10 });

    expect(client.get).toHaveBeenCalledWith(demoPaths.discovery("curated-lists"));
    expect(JSON.parse(result.content[0].text)).toEqual([{ id: "top-movers" }]);
  });

  it("defaults curated_lists to [] when the API returns null", async () => {
    const client = createMockClient({ get: vi.fn().mockResolvedValue(null) });
    const { tool, handlers } = createMockServer();
    registerDiscoveryTools(tool as any, client, demoPaths);

    const result = await handlers.get("get_discovery")!({ type: "curated_lists", count: 10 });

    expect(JSON.parse(result.content[0].text)).toEqual([]);
  });

  it("fetches recommendations with the requested count", async () => {
    const client = createMockClient({ get: vi.fn().mockResolvedValue({ recommendations: [{ id: 1 }] }) });
    const { tool, handlers } = createMockServer();
    registerDiscoveryTools(tool as any, client, demoPaths);

    const result = await handlers.get("get_discovery")!({ type: "recommendations", count: 5 });

    expect(client.get).toHaveBeenCalledWith(demoPaths.discovery("market-recommendations/5"));
    expect(JSON.parse(result.content[0].text)).toEqual({ recommendations: [{ id: 1 }] });
  });

  it("returns a friendly empty message when recommendations are unavailable", async () => {
    const client = createMockClient({ get: vi.fn().mockResolvedValue(undefined) });
    const { tool, handlers } = createMockServer();
    registerDiscoveryTools(tool as any, client, demoPaths);

    const result = await handlers.get("get_discovery")!({ type: "recommendations", count: 5 });

    expect(JSON.parse(result.content[0].text)).toEqual({
      recommendations: [],
      message: "No recommendations available for this account.",
    });
  });

  it("returns errorContent when the client throws", async () => {
    const client = createMockClient({ get: vi.fn().mockRejectedValue(new Error("boom")) });
    const { tool, handlers } = createMockServer();
    registerDiscoveryTools(tool as any, client, demoPaths);

    const result = await handlers.get("get_discovery")!({ type: "curated_lists", count: 10 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to get discovery data: boom");
  });
});
