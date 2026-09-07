import { describe, it, expect, vi } from "vitest";
import { registerFeedTools } from "../../../src/tools/feeds.js";
import { createMockServer, createMockClient, demoPaths } from "../../helpers/mock-mcp.js";

describe("get_feeds handler", () => {
  it("fetches feed posts for an instrument with pagination params", async () => {
    const client = createMockClient({ get: vi.fn().mockResolvedValue({ items: [] }) });
    const { tool, handlers } = createMockServer();
    registerFeedTools(tool as any, client, demoPaths);

    await handlers.get("get_feeds")!({ type: "instrument", id: "18", take: 20, offset: 0 });

    expect(client.get).toHaveBeenCalledWith(demoPaths.feeds("instrument/18"), { take: 20, offset: 0 });
  });

  it("returns errorContent when the client throws", async () => {
    const client = createMockClient({ get: vi.fn().mockRejectedValue(new Error("timeout")) });
    const { tool, handlers } = createMockServer();
    registerFeedTools(tool as any, client, demoPaths);

    const result = await handlers.get("get_feeds")!({ type: "user", id: "5", take: 20, offset: 0 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to get feeds: timeout");
  });
});

describe("create_post handler", () => {
  it("creates a post with tags and mentions", async () => {
    const client = createMockClient({ post: vi.fn().mockResolvedValue({ id: "post-1" }) });
    const { tool, handlers } = createMockServer();
    registerFeedTools(tool as any, client, demoPaths);

    const result = await handlers.get("create_post")!({
      action: "post",
      message: "Bought some AAPL",
      owner: 42,
      tags: ["AAPL"],
      mentions: [7],
    });

    expect(client.post).toHaveBeenCalledWith(demoPaths.feeds("post"), {
      message: "Bought some AAPL",
      owner: 42,
      tags: ["AAPL"],
      mentions: [7],
    });
    expect(JSON.parse(result.content[0].text)).toEqual({ id: "post-1" });
  });

  it("rejects a post without an owner", async () => {
    const client = createMockClient();
    const { tool, handlers } = createMockServer();
    registerFeedTools(tool as any, client, demoPaths);

    const result = await handlers.get("create_post")!({ action: "post", message: "hi" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("owner is required for creating a post");
    expect(client.post).not.toHaveBeenCalled();
  });

  it("creates a comment on a post", async () => {
    const client = createMockClient({ post: vi.fn().mockResolvedValue({ id: "comment-1" }) });
    const { tool, handlers } = createMockServer();
    registerFeedTools(tool as any, client, demoPaths);

    await handlers.get("create_post")!({ action: "comment", message: "nice trade", postId: "post-1" });

    expect(client.post).toHaveBeenCalledWith(demoPaths.reactions("post-1/comment"), { message: "nice trade" });
  });

  it("rejects a comment without a postId", async () => {
    const client = createMockClient();
    const { tool, handlers } = createMockServer();
    registerFeedTools(tool as any, client, demoPaths);

    const result = await handlers.get("create_post")!({ action: "comment", message: "nice trade" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("postId is required for commenting");
  });

  it("returns errorContent when the client throws", async () => {
    const client = createMockClient({ post: vi.fn().mockRejectedValue(new Error("500")) });
    const { tool, handlers } = createMockServer();
    registerFeedTools(tool as any, client, demoPaths);

    const result = await handlers.get("create_post")!({ action: "post", message: "hi", owner: 1 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to create post: 500");
  });
});
