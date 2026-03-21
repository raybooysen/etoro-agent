import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { EtoroClient } from "../client.js";
import type { PathResolver } from "../utils/path-resolver.js";
import { jsonContent, errorContent } from "../utils/formatters.js";

export function registerFeedTools(
  server: McpServer,
  client: EtoroClient,
  paths: PathResolver,
): void {
  server.tool(
    "get_feeds",
    "Get social feed posts for an instrument or user",
    {
      type: z.enum(["instrument", "user"]).describe("Feed type"),
      id: z.string().describe("Instrument market ID or user ID"),
      take: z.number().int().min(1).max(100).default(20).describe("Number of posts to return"),
      offset: z.number().int().min(0).default(0).describe("Offset for pagination"),
    },
    async ({ type, id, take, offset }) => {
      try {
        const result = await client.get(paths.feeds(`${type}/${id}`), {
          take,
          offset,
        });
        return jsonContent(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return errorContent(`Failed to get feeds: ${message}`);
      }
    },
  );

  server.tool(
    "create_post",
    "Create a social post or comment on an existing post",
    {
      action: z.enum(["post", "comment"]).describe("'post' to create a new post, 'comment' to comment on a post"),
      message: z.string().min(1).describe("Post or comment text"),
      // Post-specific fields
      owner: z.number().int().positive().optional().describe("Owner user ID (required for post)"),
      tags: z.array(z.string()).optional().describe("Tags for the post"),
      mentions: z.array(z.number().int().positive()).optional().describe("User IDs to mention"),
      // Comment-specific fields
      postId: z.string().optional().describe("Post ID to comment on (required for comment)"),
    },
    async (args) => {
      try {
        if (args.action === "post") {
          if (args.owner === undefined) return errorContent("owner is required for creating a post");
          const body: Record<string, unknown> = {
            message: args.message,
            owner: args.owner,
          };
          if (args.tags) body.tags = args.tags;
          if (args.mentions) body.mentions = args.mentions;
          const result = await client.post(paths.feeds("post"), body);
          return jsonContent(result);
        }

        // Comment
        if (!args.postId) return errorContent("postId is required for commenting");
        const result = await client.post(
          paths.reactions(`${args.postId}/comment`),
          { message: args.message },
        );
        return jsonContent(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return errorContent(`Failed to create post: ${message}`);
      }
    },
  );
}
