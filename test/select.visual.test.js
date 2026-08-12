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

  it("counts related picker ornaments as 2", () => {
    expect(charWidth(0x276e)).toBe(2); // ❮
    expect(charWidth(0x276d)).toBe(2); // ❭
    expect(charWidth(0x25b6)).toBe(2); // ▶
    expect(charWidth(0x25b8)).toBe(2); // ▸
  });

  it("counts CJK / fullwidth as 2", () => {
    expect(charWidth(0x4e00)).toBe(2);
    expect(stringWidth("Ａ")).toBe(2);
    expect(stringWidth("漢字")).toBe(4);
  });

  it("counts combining marks as 0", () => {
    expect(charWidth(0x0301)).toBe(0); // combining acute
    expect(charWidth(0x0300)).toBe(0);
    // base + combining acute: display width = 1
    expect(stringWidth("e\u0301")).toBe(1);
  });

  it("treats C0/C1 controls as width 0", () => {
    expect(charWidth(0)).toBe(0);
    expect(charWidth(0x07)).toBe(0); // BEL
    expect(charWidth(0x1b)).toBe(0); // ESC
    expect(charWidth(0x7f)).toBe(0); // DEL
    expect(charWidth(0x9b)).toBe(0); // C1
  });

  it("counts box-drawing / block elements as 2", () => {
    expect(charWidth(0x2500)).toBe(2); // ─
    expect(charWidth(0x2550)).toBe(2); // ═
    expect(charWidth(0x2588)).toBe(2); // █
  });

  it("empty string has width 0", () => {
    expect(stringWidth("")).toBe(0);
  });
});

describe("visualLineCount", () => {
  it("empty string still occupies one row", () => {
    expect(visualLineCount("", 80)).toBe(1);
  });

  it("only newlines: each logical line is one row", () => {
    expect(visualLineCount("\n", 80)).toBe(2);
    expect(visualLineCount("\n\n", 80)).toBe(3);
    expect(visualLineCount("\n\n\n", 80)).toBe(4);
  });

  it("trailing newline adds an empty final row", () => {
    expect(visualLineCount("a\n", 80)).toBe(2);
    expect(visualLineCount("hello\n", 80)).toBe(2);
    expect(visualLineCount("a\nb\n", 80)).toBe(3);
  });

  it("counts logical newlines (empty lines still one row)", () => {
    expect(visualLineCount("a\n\nb", 80)).toBe(3);
  });

  it("columns = 1 wraps each display column to its own row", () => {
    expect(visualLineCount("abc", 1)).toBe(3);
    expect(visualLineCount("ab", 1)).toBe(2);
    // ❯ is 2 cols → ceil(2/1) = 2 rows
    expect(visualLineCount("❯", 1)).toBe(2);
  });

  it("wraps exactly at cols and cols+1 (boundary)", () => {
    // width 5, cols 5 → exactly one row; cols 4 → two rows
    expect(visualLineCount("hello", 5)).toBe(1);
    expect(visualLineCount("hello", 4)).toBe(2);
    // width 10, exact fit vs one over
    expect(visualLineCount("0123456789", 10)).toBe(1);
    expect(visualLineCount("0123456789X", 10)).toBe(2);
    // ❯❯ width 4: exact at 4, overflow at 3
    expect(visualLineCount("❯❯", 4)).toBe(1);
    expect(visualLineCount("❯❯", 3)).toBe(2);
  });

  it("wraps by columns using display width", () => {
    expect(visualLineCount("hello", 80)).toBe(1);
    expect(visualLineCount("hello", 3)).toBe(2); // ceil(5/3)
  });

  it("ANSI-only line still counts as one empty visual row", () => {
    const sgrOnly = "\x1b[36m\x1b[0m";
    expect(visualLineCount(sgrOnly, 80)).toBe(1);
    const boldOnly = "\x1b[1m\x1b[22m";
    expect(visualLineCount(boldOnly, 40)).toBe(1);
  });

  it("strips ANSI SGR / CSI before measuring (mixed ANSI + text)", () => {
    const colored = "\x1b[36m❯\x1b[0m item";
    // plain display: ❯(2) + space(1) + item(4) = 7
    expect(visualLineCount(colored, 80)).toBe(1);
    expect(visualLineCount(colored, 4)).toBe(2);
    expect(visualLineCount(colored, 7)).toBe(1);
    expect(visualLineCount(colored, 6)).toBe(2);
  });

  it("strips OSC hyperlinks before measuring", () => {
    const osc = "\x1b]8;;https://example.com\x07link\x1b]8;;\x07";
    expect(visualLineCount(osc, 80)).toBe(1);
    expect(visualLineCount(osc, 2)).toBe(2); // "link" = 4 cols
  });

  it("very long single line wraps by ceil(width/cols)", () => {
    const long = "x".repeat(200);
    expect(visualLineCount(long, 80)).toBe(Math.ceil(200 / 80)); // 3
    expect(visualLineCount(long, 40)).toBe(5);
    expect(visualLineCount(long, 1)).toBe(200);
    expect(visualLineCount(long, 200)).toBe(1);
    expect(visualLineCount(long, 199)).toBe(2);
  });

  it("coerces falsy columns via || 80; negative → Math.max(1, …)", () => {
    // `columns || 80`: 0/undefined/null fall back to 80 → one row for "ab"
    expect(visualLineCount("ab", 0)).toBe(1);
    expect(visualLineCount("ab", undefined)).toBe(1);
    // negative is truthy, then Math.max(1, -5) → cols=1 → two rows
    expect(visualLineCount("ab", -5)).toBe(2);
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
