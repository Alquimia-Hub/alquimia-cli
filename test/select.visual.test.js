import { describe, it, expect } from "vitest";
import {
  charWidth,
  stringWidth,
  visualLineCount,
} from "../src/select.js";

describe("charWidth / stringWidth", () => {
  it("counts ASCII as 1", () => {
    expect(charWidth(0x41)).toBe(1);
    expect(stringWidth("hello")).toBe(5);
  });

  it("counts Latin accented letters as 1 (Spanish blurbs)", () => {
    expect(stringWidth("sección")).toBe(7);
    expect(charWidth("á".codePointAt(0))).toBe(1);
    expect(charWidth("ñ".codePointAt(0))).toBe(1);
  });

  it("counts ❯ (select cursor) as 2 columns — wrap regression", () => {
    expect(charWidth(0x276f)).toBe(2);
    expect(stringWidth("❯")).toBe(2);
    // length undercounts: two ❯ → String.length 2, display width 4
    expect("❯❯".length).toBe(2);
    expect(stringWidth("❯❯")).toBe(4);
  });

  it("counts CJK / fullwidth as 2", () => {
    expect(charWidth(0x4e00)).toBe(2);
    expect(stringWidth("Ａ")).toBe(2);
  });

  it("counts combining marks as 0", () => {
    expect(charWidth(0x0301)).toBe(0);
  });
});

describe("visualLineCount", () => {
  it("counts logical newlines (empty lines still one row)", () => {
    expect(visualLineCount("", 80)).toBe(1);
    expect(visualLineCount("\n", 80)).toBe(2);
    expect(visualLineCount("a\n\nb", 80)).toBe(3);
  });

  it("wraps by columns using display width", () => {
    expect(visualLineCount("hello", 80)).toBe(1);
    expect(visualLineCount("hello", 3)).toBe(2); // ceil(5/3)
    // ❯ at width 2: "❯❯" width 4 → 2 rows at cols=3
    expect(visualLineCount("❯❯", 3)).toBe(2);
    expect(visualLineCount("❯❯", 4)).toBe(1);
  });

  it("strips ANSI SGR / CSI before measuring", () => {
    const colored = "\x1b[36m❯\x1b[0m item";
    // plain display: ❯(2) + space(1) + item(4) = 7
    expect(visualLineCount(colored, 80)).toBe(1);
    expect(visualLineCount(colored, 4)).toBe(2);
  });

  it("strips OSC hyperlinks before measuring", () => {
    const osc = "\x1b]8;;https://example.com\x07link\x1b]8;;\x07";
    expect(visualLineCount(osc, 80)).toBe(1);
    expect(visualLineCount(osc, 2)).toBe(2); // "link" = 4 cols
  });

  it("matches multi-line tools section picker shape", () => {
    const text = [
      "❯ Skills",
      "    Pack de skills de la comunidad",
      "",
      "↑↓ · Enter · q",
    ].join("\n");
    expect(visualLineCount(text, 80)).toBe(4);
    expect(visualLineCount(text, 60)).toBe(4);

    const longBlurb = [
      "❯ Name",
      "    " + "x".repeat(50),
      "",
      "hint",
    ].join("\n");
    // blurb: 4 spaces + 50x = 54 → 2 rows at cols=40 → total 5
    expect(visualLineCount(longBlurb, 40)).toBe(5);
  });
});
