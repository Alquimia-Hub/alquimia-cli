import { style } from "./style.js";

/**
 * Figlet-like wordmark + clean triangle mark (option A).
 * Accents: `(` crescent moon, `*` star.
 * Triangle uses `.` (not `·`) for broad terminal compatibility.
 * Art is baked in — no figlet runtime dependency.
 */
export const BANNER = [
  "   (                    *",
  "      ╔═╗╦  ╔═╗ ╦ ╦╦╔╦╗╦╔═╗",
  "      ╠═╣║  ║═╬╗║ ║║║║║║╠═╣",
  "      ╩ ╩╩═╝╚═╝╚╚═╝╩╩ ╩╩╩ ╩",
  "             /\\",
  "            /  \\",
  "           / .  \\",
  "          /______\\",
].join("\n");

function paint(code, text) {
  return `\u001b[${code}m${text}\u001b[0m`;
}

/**
 * @param {{ color?: boolean }} [opts]
 * @returns {string}
 */
export function renderBanner({ color } = {}) {
  const useColor = color ?? style.enabled;
  if (!useColor) return BANNER;

  // Cream / gold-ish yellow; triangle slightly dimmer.
  const gold = (t) => paint("33", t);
  const dimGold = (t) => paint("2;33", t);
  const dim = (t) => paint("2", t);

  return BANNER.split("\n")
    .map((line, i) => {
      if (i === 0) {
        return line.replace("(", dim("(")).replace("*", dim("*"));
      }

      if (i >= 1 && i <= 3) {
        const trimmed = line.trimStart();
        const lead = line.slice(0, line.length - trimmed.length);
        return lead + gold(trimmed);
      }

      if (i >= 4) {
        const trimmed = line.trimStart();
        const lead = line.slice(0, line.length - trimmed.length);
        return lead + dimGold(trimmed);
      }

      return line;
    })
    .join("\n");
}
