import { describe, it, expect } from "vitest";
import { ConfigSchema, EnvironmentSchema } from "../../../src/types/config.js";

describe("EnvironmentSchema", () => {
  it("accepts 'demo'", () => {
    expect(EnvironmentSchema.parse("demo")).toBe("demo");
  });

  it("accepts 'real'", () => {
    expect(EnvironmentSchema.parse("real")).toBe("real");
  });

  it("rejects invalid values", () => {
    expect(() => EnvironmentSchema.parse("staging")).toThrow();
  });
});

describe("ConfigSchema", () => {
  it("parses valid config", () => {
    const result = ConfigSchema.parse({
      apiKey: "key-123",
      userKey: "user-456",
      environment: "real",
    });
    expect(result).toEqual({
      apiKey: "key-123",
      userKey: "user-456",
      environment: "real",
    });
  });

  it("defaults environment to demo", () => {
    const result = ConfigSchema.parse({
      apiKey: "key",
      userKey: "user",
    });
    expect(result.environment).toBe("demo");
  });

  it("rejects empty apiKey", () => {
    expect(() =>
      ConfigSchema.parse({ apiKey: "", userKey: "user" }),
    ).toThrow("ETORO_API_KEY is required");
  });

  it("rejects empty userKey", () => {
    expect(() =>
      ConfigSchema.parse({ apiKey: "key", userKey: "" }),
    ).toThrow("ETORO_USER_KEY is required");
  });

  it("rejects missing apiKey", () => {
    expect(() => ConfigSchema.parse({ userKey: "user" })).toThrow();
  });
});
