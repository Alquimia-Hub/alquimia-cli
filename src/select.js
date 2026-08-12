import { stdin as input, stdout as output } from "node:process";
import { style } from "./style.js";

const CURSOR_HIDE = "\x1b[?25l";
const CURSOR_SHOW = "\x1b[?25h";
const ERASE_DOWN = "\x1b[0J";

/**
 * Strip CSI (`ESC[…`) and OSC (`ESC]…BEL` / `ESC]…ESC\`) sequences before
 * measuring width. Broader than SGR-only so wrap math ignores all styling.
 */
const ANSI_CSI_OSC_RE =
  /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;

/**
 * Minimal terminal column width for one Unicode code point (zero deps).
 * Combining marks → 0; East-Asian wide/fullwidth → 2; picker glyphs that
 * VS Code / Cursor often render double-wide (❯ etc.) → 2; else → 1.
 *
 * @param {number} cp
 * @returns {number}
 */
export function charWidth(cp) {
  if (cp === 0) return 0;
  if (cp < 32 || (cp >= 0x7f && cp < 0xa0)) return 0;

  // Combining marks (common blocks).
  if (
    (cp >= 0x0300 && cp <= 0x036f) ||
    (cp >= 0x1ab0 && cp <= 0x1aff) ||
    (cp >= 0x1dc0 && cp <= 0x1dff) ||
    (cp >= 0x20d0 && cp <= 0x20ff) ||
    (cp >= 0xfe20 && cp <= 0xfe2f)
  ) {
    return 0;
  }

  // East Asian Wide / Fullwidth (classic wcwidth ranges).
  if (
    cp >= 0x1100 &&
    (cp <= 0x115f ||
      cp === 0x2329 ||
      cp === 0x232a ||
      (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe10 && cp <= 0xfe19) ||
      (cp >= 0xfe30 && cp <= 0xfe6f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      (cp >= 0x20000 && cp <= 0x3fffd))
  ) {
    return 2;
  }

  // Ambiguous ornaments / pointers often drawn 2 cols in integrated terminals.
  // ❯ U+276F is the select cursor glyph.
  if (
    cp === 0x276f || // ❯
    cp === 0x276e || // ❮
    cp === 0x276d || // ❭
    cp === 0x25b6 || // ▶
    cp === 0x25b8 // ▸
  ) {
    return 2;
  }

  // Box drawing / block elements — Ambiguous EAW, often 2 in VS Code / Cursor.
  if (
    (cp >= 0x2500 && cp <= 0x257f) ||
    (cp >= 0x2580 && cp <= 0x259f)
  ) {
    return 2;
  }

  return 1;
}

/**
 * Display width of a string (ANSI already stripped).
 *
 * @param {string} plain
 * @returns {number}
 */
export function stringWidth(plain) {
  let w = 0;
  for (const ch of plain) {
    w += charWidth(ch.codePointAt(0));
  }
  return w;
}

/**
 * Visual row count for terminal text: strip CSI/OSC, then wrap each logical
 * line by display width vs `columns` (min 1). Empty logical lines still
 * occupy one row.
 *
 * @param {string} text
 * @param {number} columns
 * @returns {number}
 */
export function visualLineCount(text, columns) {
  const cols = Math.max(1, columns || 80);
  let count = 0;
  for (const line of String(text).split("\n")) {
    const plain = line.replace(ANSI_CSI_OSC_RE, "");
    const len = stringWidth(plain);
    count += Math.max(1, Math.ceil(len / cols) || 1);
  }
  return count;
}

/**
 * Case-insensitive substring filter over items.
 * @param {string[]} items
 * @param {string} query
 * @param {(item: string, index: number) => string} [getFilterText]
 * @returns {number[]} original indices that match
 */
export function filterItemIndices(items, query, getFilterText) {
  const q = String(query || "")
    .trim()
    .toLowerCase();
  if (!q) {
    return items.map((_, i) => i);
  }
  const getText =
    getFilterText ??
    ((item) => String(item ?? ""));
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const hay = String(getText(items[i], i) ?? "").toLowerCase();
    if (hay.includes(q)) out.push(i);
  }
  return out;
}

/**
 * Tiny raw-mode arrow selector (zero deps).
 * Returns the selected index (into the original `items` array), or `null`
 * if the user cancels (q / Esc / Ctrl+C — see filterable Esc behavior).
 *
 * When `filterable` is true:
 * - printable chars (incl. q) append to the query; Backspace edits it
 * - Esc clears the filter if non-empty, otherwise cancels
 * - Ctrl+C always cancels; bare `q` is NOT special in filterable mode
 *
 * @param {string[]} items  Plain labels (one line each). Prefer no newlines.
 * @param {{
 *   initialIndex?: number,
 *   hint?: string,
 *   renderItem?: (item: string, index: number, selected: boolean) => string,
 *   stdin?: NodeJS.ReadStream,
 *   stdout?: NodeJS.WriteStream,
 *   filterable?: boolean,
 *   getFilterText?: (item: string, index: number) => string,
 *   filterLabel?: string,
 * }} [opts]
 * @returns {Promise<number|null>}
 */
export function select(items, opts = {}) {
  const stdin = opts.stdin ?? input;
  const stdout = opts.stdout ?? output;
  const filterable = Boolean(opts.filterable);
  const filterLabel = opts.filterLabel ?? "Filtro";
  const getFilterText = opts.getFilterText;
  const hint =
    opts.hint ??
    (filterable
      ? "↑↓ · Enter · escribí para filtrar · Esc limpia/sale"
      : "↑↓ para elegir · Enter para confirmar · q para salir");
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

  let query = "";
  let filtered = filterItemIndices(items, query, getFilterText);
  let index = Math.min(
    Math.max(opts.initialIndex ?? 0, 0),
    Math.max(filtered.length - 1, 0)
  );
  // Map initialIndex (original) into filtered view when possible.
  if (opts.initialIndex != null && filtered.length) {
    const pos = filtered.indexOf(opts.initialIndex);
    if (pos >= 0) index = pos;
  }

  let lineCount = 0;
  let drawn = false;

  const columns = () => Math.max(1, stdout.columns || 80);

  const write = (s) => {
    stdout.write(s);
  };

  /**
   * Clear the previous frame. Convention: each draw ends with a trailing `\n`,
   * so the cursor sits on a fresh line below the picker. Move up exactly
   * `lineCount` rows, return to column 0, erase down. No DECSC/DECRC —
   * those are unreliable in VS Code / Cursor integrated terminals after
   * multi-line writes.
   */
  const clearDrawn = () => {
    if (!drawn || lineCount <= 0) return;
    write(`\x1b[${lineCount}A\r${ERASE_DOWN}`);
  };

  const refilter = () => {
    const prevOriginal =
      filtered.length > 0 && index >= 0 && index < filtered.length
        ? filtered[index]
        : null;
    filtered = filterItemIndices(items, query, getFilterText);
    if (filtered.length === 0) {
      index = 0;
      return;
    }
    if (prevOriginal != null) {
      const pos = filtered.indexOf(prevOriginal);
      index = pos >= 0 ? pos : 0;
    } else {
      index = Math.min(index, filtered.length - 1);
    }
  };

  const draw = () => {
    if (drawn) {
      clearDrawn();
    } else {
      drawn = true;
    }

    const rows = [];
    if (filterable) {
      const q = query.length ? query : style.dim("(vacío)");
      rows.push(`${style.dim(`${filterLabel}:`)} ${query.length ? style.cyan(query) : q}`);
      rows.push("");
    }

    if (filtered.length === 0) {
      rows.push(style.yellow("Sin resultados."));
    } else {
      for (let fi = 0; fi < filtered.length; fi++) {
        const oi = filtered[fi];
        rows.push(renderItem(items[oi], oi, fi === index));
      }
    }

    rows.push("");
    rows.push(style.dim(hint));
    const text = rows.join("\n");
    // Trailing \n parks the cursor on a blank line below the frame so the
    // next clear can move up exactly `lineCount` rows.
    write(`${text}\n`);
    lineCount = visualLineCount(text, columns());
  };

  return new Promise((resolve) => {
    let settled = false;
    const wasRaw = stdin.isRaw;

    const cleanup = (value) => {
      if (settled) return;
      settled = true;
      stdin.off("data", onData);
      if (typeof stdout.off === "function") {
        stdout.off("resize", onResize);
      } else if (typeof stdout.removeListener === "function") {
        stdout.removeListener("resize", onResize);
      }
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

    const onResize = () => {
      if (settled || !drawn) return;
      draw();
    };

    const onData = (buf) => {
      const s = buf.toString("utf8");

      // Ctrl+C
      if (s === "\u0003") {
        cleanup(null);
        return;
      }

      // Esc (alone): clear filter if active, else cancel
      if (s === "\u001b") {
        if (filterable && query.length > 0) {
          query = "";
          refilter();
          draw();
          return;
        }
        cleanup(null);
        return;
      }

      // q / Q cancel only when not filterable (filterable: q is a filter char).
      if (!filterable && (s === "q" || s === "Q")) {
        cleanup(null);
        return;
      }

      // Enter / Return
      if (s === "\r" || s === "\n") {
        if (filtered.length === 0) return;
        cleanup(filtered[index]);
        return;
      }

      // CSI arrow sequences: ESC [ A/B  (also ESC O A/B on some terms)
      if (s === "\u001b[A" || s === "\u001bOA") {
        if (filtered.length === 0) return;
        index = (index - 1 + filtered.length) % filtered.length;
        draw();
        return;
      }
      if (s === "\u001b[B" || s === "\u001bOB") {
        if (filtered.length === 0) return;
        index = (index + 1) % filtered.length;
        draw();
        return;
      }

      if (filterable) {
        // Backspace / Delete
        if (s === "\x7f" || s === "\b") {
          if (query.length > 0) {
            query = query.slice(0, -1);
            refilter();
            draw();
          }
          return;
        }

        // Printable code points (incl. q) — skip other CSI/control.
        if (s.length > 0 && !s.startsWith("\u001b")) {
          let added = false;
          for (const ch of s) {
            const cp = ch.codePointAt(0);
            if (cp >= 32 && cp !== 0x7f) {
              query += ch;
              added = true;
            }
          }
          if (added) {
            refilter();
            draw();
          }
        }
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
    if (typeof stdout.on === "function") {
      stdout.on("resize", onResize);
    }
    draw();
    stdin.on("data", onData);
  });
}
