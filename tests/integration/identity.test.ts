import { describe, it, expect } from "vitest";
import { createTestClient, skipIfNoCredentials } from "./setup.js";

const skip = skipIfNoCredentials();
const ctx = skip ? null : createTestClient()!;

describe.skipIf(skip)("Integration: Identity", () => {
  it("should return authenticated user identity", async () => {
    const result = await ctx!.client.get(ctx!.paths.identity());

    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });
});
