import { describe, expect, it } from "vitest";
import { formatVndDigitsInput, parseVndDigitsInput } from "./vndInputFormat";

describe("vndInputFormat", () => {
  it("formats typed digits with vi-VN grouping", () => {
    expect(formatVndDigitsInput("100000")).toBe("100.000");
    expect(formatVndDigitsInput("100.000")).toBe("100.000");
  });

  it("parses formatted input back to integer VND", () => {
    expect(parseVndDigitsInput("100.000")).toBe(100_000);
    expect(parseVndDigitsInput("2.500.000")).toBe(2_500_000);
  });

  it("handles empty input", () => {
    expect(formatVndDigitsInput("")).toBe("");
    expect(parseVndDigitsInput("")).toBe(0);
  });
});
