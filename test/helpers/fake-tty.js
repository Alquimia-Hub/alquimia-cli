import { EventEmitter } from "node:events";
import { charWidth } from "../../src/select.js";

/**
 * Minimal ANSI-aware buffer used to assert what a user would *see* after
 * cursor-up + erase-down redraws (detects stacked picker menus).
 */
export class VisibleTerminal {
  constructor(columns = 80) {
    this.columns = Math.max(1, columns);
    /** @type {string[]} */
    this.lines = [""];
    this.row = 0;
    this.col = 0;
  }

  ensureRow(r) {
    while (this.lines.length <= r) this.lines.push("");
  }

  write(chunk) {
    let i = 0;
    const s = String(chunk);
    while (i < s.length) {
      if (s[i] === "\x1b") {
        i = this.consumeEscape(s, i);
        continue;
      }
      if (s[i] === "\r") {
        this.col = 0;
        i += 1;
        continue;
      }
      if (s[i] === "\n") {
        this.row += 1;
        this.col = 0;
        this.ensureRow(this.row);
        i += 1;
        continue;
      }
      // Decode one Unicode code point (handles ❯ etc.).
      const cp = s.codePointAt(i);
      const ch = String.fromCodePoint(cp);
      const w = Math.max(0, charWidth(cp));
      // Soft-wrap by display columns (matches select visualLineCount).
      if (w > 0 && this.col + w > this.columns && this.col > 0) {
        this.row += 1;
        this.col = 0;
        this.ensureRow(this.row);
      }
      this.ensureRow(this.row);
      this.lines[this.row] += ch;
      this.col += w || 0;
      i += ch.length;
    }
  }

  /**
   * @param {string} s
   * @param {number} i index of ESC
   * @returns {number} next index
   */
  consumeEscape(s, i) {
    const next = s[i + 1];
    // CSI: ESC [
    if (next === "[") {
      let j = i + 2;
      while (j < s.length && /[0-9;?]/.test(s[j])) j += 1;
      // intermediate bytes
      while (j < s.length && /[ -/]/.test(s[j])) j += 1;
      const final = s[j];
      const params = s.slice(i + 2, j);
      if (final === "A") {
        const n = Number(params) || 1;
        this.row = Math.max(0, this.row - n);
      } else if (final === "B") {
        const n = Number(params) || 1;
        this.row += n;
        this.ensureRow(this.row);
      } else if (final === "C") {
        const n = Number(params) || 1;
        this.col += n;
      } else if (final === "D") {
        const n = Number(params) || 1;
        this.col = Math.max(0, this.col - n);
      } else if (final === "J") {
        // 0 / default: erase down from cursor
        const mode = params === "" ? 0 : Number(params);
        if (mode === 0 || Number.isNaN(mode)) {
          this.ensureRow(this.row);
          this.lines[this.row] = this.lines[this.row].slice(0, this.col);
          for (let r = this.row + 1; r < this.lines.length; r++) {
            this.lines[r] = "";
          }
          // Drop trailing empty lines beyond cursor row for stable joins.
          while (
            this.lines.length > this.row + 1 &&
            this.lines[this.lines.length - 1] === ""
          ) {
            this.lines.pop();
          }
        } else if (mode === 2) {
          this.lines = [""];
          this.row = 0;
          this.col = 0;
        }
      } else if (final === "K") {
        this.ensureRow(this.row);
        const mode = params === "" ? 0 : Number(params);
        const line = this.lines[this.row];
        if (mode === 2) this.lines[this.row] = "";
        else if (mode === 1) {
          this.lines[this.row] = " ".repeat(this.col) + line.slice(this.col);
        } else {
          this.lines[this.row] = line.slice(0, this.col);
        }
      }
      // else: cursor show/hide (?25h/l), SGR (m), etc. — ignore
      return j + 1;
    }
    // OSC: ESC ] ... BEL or ST
    if (next === "]") {
      let j = i + 2;
      while (j < s.length) {
        if (s[j] === "\x07") return j + 1;
        if (s[j] === "\x1b" && s[j + 1] === "\\") return j + 2;
        j += 1;
      }
      return s.length;
    }
    // DECSC / DECRC (ESC 7 / ESC 8) — intentionally not simulated as reliable;
    // if select relied on these, VisibleTerminal would not clear and tests fail.
    if (next === "7" || next === "8") {
      return i + 2;
    }
    // Other single-char escapes — skip ESC + next
    return i + 2;
  }

  /** Visible text with trailing empty lines trimmed. */
  visibleText() {
    let end = this.lines.length;
    while (end > 1 && this.lines[end - 1] === "") end -= 1;
    return this.lines.slice(0, end).join("\n");
  }
}

export function createFakeStdin() {
  const ee = new EventEmitter();
  ee.isTTY = true;
  ee.isRaw = false;
  ee.setRawMode = (v) => {
    ee.isRaw = Boolean(v);
  };
  ee.resume = () => {};
  ee.pause = () => {};
  return ee;
}

/**
 * @param {number} columns
 * @param {VisibleTerminal} [term]
 */
export function createFakeStdout(columns, term) {
  const ee = new EventEmitter();
  ee.isTTY = true;
  ee.columns = columns;
  /** @type {string[]} */
  ee.chunks = [];
  ee.write = (s) => {
    const str = String(s);
    ee.chunks.push(str);
    if (term) term.write(str);
    return true;
  };
  ee.raw = () => ee.chunks.join("");
  return ee;
}

export const KEY = {
  up: "\x1b[A",
  down: "\x1b[B",
  /** Application-cursor-mode arrows (ESC O A/B). */
  upAlt: "\x1bOA",
  downAlt: "\x1bOB",
  enter: "\r",
  q: "q",
  esc: "\x1b",
  ctrlC: "\u0003",
  backspace: "\x7f",
};
