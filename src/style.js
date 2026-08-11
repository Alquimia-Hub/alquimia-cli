/**
 * Minimal ANSI colors. Respects NO_COLOR / FORCE_COLOR / TTY.
 * FORCE_COLOR wins over NO_COLOR (same idea as Node's styleText).
 * See https://no-color.org/
 */

function colorsEnabled() {
  const force = process.env.FORCE_COLOR;
  if (force === "0") return false;
  if (force !== undefined && force !== "") return true;
  if ("NO_COLOR" in process.env) return false;
  return Boolean(process.stdout.isTTY);
}

const enabled = colorsEnabled();

function paint(code, text) {
  if (!enabled) return text;
  return `\u001b[${code}m${text}\u001b[0m`;
}

export const style = {
  enabled,
  bold: (t) => paint("1", t),
  dim: (t) => paint("2", t),
  cyan: (t) => paint("36", t),
  green: (t) => paint("32", t),
  yellow: (t) => paint("33", t),
  magenta: (t) => paint("35", t),
  red: (t) => paint("31", t),
  blue: (t) => paint("34", t),
};
