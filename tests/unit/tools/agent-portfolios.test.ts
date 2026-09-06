// tests/unit/tools/agent-portfolios.test.ts
import { describe, it, expect, vi } from "vitest";
import { registerAgentPortfolioTools } from "../../../src/tools/agent-portfolios.js";
import { createMockServer, createMockClient, demoPaths } from "../../helpers/mock-mcp.js";

function setup() {
  const client = createMockClient({
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    patch: vi.fn().mockResolvedValue({}),
  });
  const { tool, handlers } = createMockServer();
  registerAgentPortfolioTools(tool as any, client, demoPaths);
  return { client, handler: handlers.get("manage_agent_portfolios")! };
}

describe("manage_agent_portfolios handler", () => {
  it("list", async () => {
    const { client, handler } = setup();
    await handler({ action: "list" });
    expect(client.get).toHaveBeenCalledWith(demoPaths.agentPortfolios());
  });

  it("create with name and description", async () => {
    const { client, handler } = setup();
    await handler({ action: "create", name: "Momentum Bot", description: "trend follower" });
    expect(client.post).toHaveBeenCalledWith(demoPaths.agentPortfolios(), {
      name: "Momentum Bot",
      description: "trend follower",
    });
  });

  it("rejects create without a name", async () => {
    const { client, handler } = setup();
    const result = await handler({ action: "create" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("name is required for create");
    expect(client.post).not.toHaveBeenCalled();
  });

  it("delete", async () => {
    const { client, handler } = setup();
    await handler({ action: "delete", agentPortfolioId: "pf-1" });
    expect(client.delete).toHaveBeenCalledWith(demoPaths.agentPortfolios("pf-1"));
  });

  it("rejects delete without agentPortfolioId", async () => {
    const { handler } = setup();
    const result = await handler({ action: "delete" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("agentPortfolioId is required");
  });

  it("create_token with settings JSON", async () => {
    const { client, handler } = setup();
    await handler({ action: "create_token", agentPortfolioId: "pf-1", tokenSettings: '{"scope":"read"}' });
    expect(client.post).toHaveBeenCalledWith(demoPaths.agentPortfolios("pf-1/user-tokens"), { scope: "read" });
  });

  it("create_token without settings defaults to {}", async () => {
    const { client, handler } = setup();
    await handler({ action: "create_token", agentPortfolioId: "pf-1" });
    expect(client.post).toHaveBeenCalledWith(demoPaths.agentPortfolios("pf-1/user-tokens"), {});
  });

  it("rejects create_token without agentPortfolioId", async () => {
    const { handler } = setup();
    const result = await handler({ action: "create_token" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("agentPortfolioId is required");
  });

  it("revoke_token", async () => {
    const { client, handler } = setup();
    await handler({ action: "revoke_token", agentPortfolioId: "pf-1", userTokenId: "tok-1" });
    expect(client.delete).toHaveBeenCalledWith(demoPaths.agentPortfolios("pf-1/user-tokens/tok-1"));
  });

  it("rejects revoke_token missing either id", async () => {
    const { handler } = setup();
    const result = await handler({ action: "revoke_token", agentPortfolioId: "pf-1" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("agentPortfolioId and userTokenId are required");
  });

  it("update_token with settings JSON", async () => {
    const { client, handler } = setup();
    await handler({ action: "update_token", agentPortfolioId: "pf-1", userTokenId: "tok-1", tokenSettings: '{"scope":"write"}' });
    expect(client.patch).toHaveBeenCalledWith(demoPaths.agentPortfolios("pf-1/user-tokens/tok-1"), { scope: "write" });
  });

  it("rejects update_token missing either id", async () => {
    const { handler } = setup();
    const result = await handler({ action: "update_token", userTokenId: "tok-1" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("agentPortfolioId and userTokenId are required");
  });

  it("returns errorContent when the client throws", async () => {
    const client = createMockClient({ get: vi.fn().mockRejectedValue(new Error("503")) });
    const { tool, handlers } = createMockServer();
    registerAgentPortfolioTools(tool as any, client, demoPaths);

    const result = await handlers.get("manage_agent_portfolios")!({ action: "list" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to manage agent portfolio: 503");
  });
});
