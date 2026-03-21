import { describe, it, expect } from "vitest";
import {
  jsonContent,
  textContent,
  errorContent,
} from "../../../src/utils/formatters.js";

describe("formatters", () => {
  describe("jsonContent", () => {
    it("returns content array with pretty-printed JSON", () => {
      const data = { name: "AAPL", price: 150.25 };
      const result = jsonContent(data);

      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify(data, null, 2),
          },
        ],
      });
    });

    it("handles arrays", () => {
      const data = [1, 2, 3];
      const result = jsonContent(data);

      expect(result.content[0]!.text).toBe("[\n  1,\n  2,\n  3\n]");
    });

    it("handles null", () => {
      const result = jsonContent(null);
      expect(result.content[0]!.text).toBe("null");
    });

    it("handles primitive values", () => {
      expect(jsonContent(42).content[0]!.text).toBe("42");
      expect(jsonContent("hello").content[0]!.text).toBe('"hello"');
      expect(jsonContent(true).content[0]!.text).toBe("true");
    });

    it("handles nested objects", () => {
      const data = { outer: { inner: { deep: true } } };
      const result = jsonContent(data);

      expect(JSON.parse(result.content[0]!.text)).toEqual(data);
    });

    it("has correct content structure with type 'text'", () => {
      const result = jsonContent({});
      expect(result.content).toHaveLength(1);
      expect(result.content[0]!.type).toBe("text");
    });
  });

  describe("textContent", () => {
    it("returns content array with the provided text", () => {
      const result = textContent("Hello, world!");

      expect(result).toEqual({
        content: [{ type: "text", text: "Hello, world!" }],
      });
    });

    it("handles empty string", () => {
      const result = textContent("");
      expect(result.content[0]!.text).toBe("");
    });

    it("preserves multiline text", () => {
      const text = "line1\nline2\nline3";
      const result = textContent(text);
      expect(result.content[0]!.text).toBe(text);
    });

    it("does not have isError property", () => {
      const result = textContent("test");
      expect(result).not.toHaveProperty("isError");
    });
  });

  describe("errorContent", () => {
    it("returns content array with isError flag", () => {
      const result = errorContent("Something went wrong");

      expect(result).toEqual({
        content: [{ type: "text", text: "Something went wrong" }],
        isError: true,
      });
    });

    it("has isError set to true", () => {
      const result = errorContent("error");
      expect(result.isError).toBe(true);
    });

    it("preserves error message exactly", () => {
      const msg = "Rate limit exceeded: 429 Too Many Requests";
      const result = errorContent(msg);
      expect(result.content[0]!.text).toBe(msg);
    });

    it("has correct content structure", () => {
      const result = errorContent("err");
      expect(result.content).toHaveLength(1);
      expect(result.content[0]!.type).toBe("text");
    });
  });
});
