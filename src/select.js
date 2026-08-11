import { stdin as input, stdout as output } from "node:process";
import { style } from "./style.js";

const CLEAR_LINE = "\x1b[2K";
const CURSOR_HIDE = "\x1b[?25l";
const CURSOR_SHOW = "\x1b[?25h";

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

  const write = (s) => {
    stdout.write(s);
  };

  const clearDrawn = () => {
    if (lineCount <= 0) return;
    write(`\r${CLEAR_LINE}`);
    for (let i = 1; i < lineCount; i++) {
      write(`\x1b[1A${CLEAR_LINE}`);
    }
  };

  const draw = () => {
    clearDrawn();
    const rows = items.map((item, i) => renderItem(item, i, i === index));
    rows.push("");
    rows.push(style.dim(hint));
    const text = rows.join("\n");
    write(text);
    // Count real terminal lines (renderItem may emit multi-line rows).
    lineCount = text.split("\n").length;
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
      clearDrawn();
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
