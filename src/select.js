import { stdin as input, stdout as output } from "node:process";
import { style } from "./style.js";

const CURSOR_HIDE = "\x1b[?25l";
const CURSOR_SHOW = "\x1b[?25h";
const CURSOR_SAVE = "\x1b7";
const CURSOR_RESTORE = "\x1b8";
const ERASE_DOWN = "\x1b[0J";
const CLEAR_LINE = "\x1b[2K";

/** Strip SGR / CSI color sequences (`ESC[…m`) before measuring width. */
const ANSI_SGR_RE = /\x1b\[[0-9;]*m/g;

/**
 * Visual row count for terminal text: strip ANSI, then wrap each logical
 * line by `columns` (min 1). Empty logical lines still occupy one row.
 *
 * @param {string} text
 * @param {number} columns
 * @returns {number}
 */
export function visualLineCount(text, columns) {
  const cols = Math.max(1, columns || 80);
  let count = 0;
  for (const line of String(text).split("\n")) {
    const plain = line.replace(ANSI_SGR_RE, "");
    const len = plain.length;
    count += Math.max(1, Math.ceil(len / cols) || 1);
  }
  return count;
}

/**
 * Tiny raw-mode arrow selector (zero deps).
 * Returns the selected index, or `null` if the user cancels (q / Esc / Ctrl+C).
 *
 * @param {string[]} items  Plain labels (one line each). Prefer no newlines.
 * @param {{
 *   initialIndex?: number,
 *   hint?: string,
 *   renderItem?: (item: string, index: number, selected: boolean) => string,
 *   stdin?: NodeJS.ReadStream,
 *   stdout?: NodeJS.WriteStream,
 * }} [opts]
 * @returns {Promise<number|null>}
 */
export function select(items, opts = {}) {
  const stdin = opts.stdin ?? input;
  const stdout = opts.stdout ?? output;
  const hint =
    opts.hint ??
    "↑↓ para elegir · Enter para confirmar · q para salir";
  const renderItem =
    opts.renderItem ??
    ((item, _index, selected) =>
      selected
        ? `${style.cyan("❯")} ${style.bold(item)}`
        : `  ${item}`);

  if (!Array.isArray(items) || items.length === 0) {
    return Promise.resolve(null);
  }

  if (!stdin.isTTY || !stdout.isTTY || typeof stdin.setRawMode !== "function") {
    return Promise.resolve(null);
  }

  let index = Math.min(
    Math.max(opts.initialIndex ?? 0, 0),
    items.length - 1
  );
  let lineCount = 0;
  let drawn = false;

  const columns = () => Math.max(1, stdout.columns || 80);

  const write = (s) => {
    stdout.write(s);
  };

  /** Fallback clear by walking up the previous visual line count. */
  const clearByLineCount = () => {
    if (lineCount <= 0) return;
    write(`\r${CLEAR_LINE}`);
    for (let i = 1; i < lineCount; i++) {
      write(`\x1b[1A${CLEAR_LINE}`);
    }
  };

  const clearDrawn = () => {
    if (!drawn) return;
    // Restore to picker start and erase everything below (handles wrap).
    write(CURSOR_RESTORE);
    write(ERASE_DOWN);
  };

  const draw = () => {
    if (drawn) {
      clearDrawn();
    } else {
      write(CURSOR_SAVE);
      drawn = true;
    }

    const rows = items.map((item, i) => renderItem(item, i, i === index));
    rows.push("");
    rows.push(style.dim(hint));
    const text = rows.join("\n");
    write(text);
    // Visual rows (ANSI-stripped + wrap), not just logical `\n` count.
    lineCount = visualLineCount(text, columns());
  };

  return new Promise((resolve) => {
    let settled = false;
    const wasRaw = stdin.isRaw;

    const cleanup = (value) => {
      if (settled) return;
      settled = true;
      stdin.off("data", onData);
      try {
        stdin.setRawMode(wasRaw);
      } catch {
        // ignore
      }
      stdin.pause();
      write(CURSOR_SHOW);
      if (drawn) {
        clearDrawn();
      } else {
        clearByLineCount();
      }
      // Leave the cursor on a fresh line after wiping the picker.
      write("\r\n");
      resolve(value);
    };

    const onData = (buf) => {
      const s = buf.toString("utf8");

      // Ctrl+C
      if (s === "\u0003") {
        cleanup(null);
        return;
      }

      // Esc (alone) or q / Q
      if (s === "\u001b" || s === "q" || s === "Q") {
        cleanup(null);
        return;
      }

      // Enter / Return
      if (s === "\r" || s === "\n") {
        cleanup(index);
        return;
      }

      // CSI arrow sequences: ESC [ A/B  (also ESC O A/B on some terms)
      if (s === "\u001b[A" || s === "\u001bOA") {
        index = (index - 1 + items.length) % items.length;
        draw();
        return;
      }
      if (s === "\u001b[B" || s === "\u001bOB") {
        index = (index + 1) % items.length;
        draw();
      }
    };

    try {
      stdin.setRawMode(true);
    } catch {
      cleanup(null);
      return;
    }

    stdin.resume();
    write(CURSOR_HIDE);
    draw();
    stdin.on("data", onData);
  });
}
