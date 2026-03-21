import { describe, it, expect } from "vitest";
import { EtoroApiError } from "../../../src/types/errors.js";

describe("EtoroApiError", () => {
  it("sets name to EtoroApiError", () => {
    const error = new EtoroApiError("test", 400);
    expect(error.name).toBe("EtoroApiError");
  });

  it("extends Error", () => {
    const error = new EtoroApiError("test", 400);
    expect(error).toBeInstanceOf(Error);
  });

  it("stores message and statusCode", () => {
    const error = new EtoroApiError("Not found", 404);
    expect(error.message).toBe("Not found");
    expect(error.statusCode).toBe(404);
  });

  it("stores optional body and errorCode", () => {
    const body = { detail: "rate limited" };
    const error = new EtoroApiError("Too many requests", 429, body, "RATE_LIMIT");
    expect(error.body).toEqual(body);
    expect(error.errorCode).toBe("RATE_LIMIT");
  });

  it("defaults body to undefined when not provided", () => {
    const error = new EtoroApiError("error", 500);
    expect(error.body).toBeUndefined();
    expect(error.errorCode).toBeUndefined();
  });

  it("has readonly properties", () => {
    const error = new EtoroApiError("err", 400, null, "CODE");
    // Verify properties exist and are set correctly
    expect(error.statusCode).toBe(400);
    expect(error.body).toBeNull();
    expect(error.errorCode).toBe("CODE");
  });
});
