/**
 * Inline text styling on top of OpenTUI's `StyledText`.
 *
 * `style.green("✓")` returns a styled chunk, not an ANSI string, so chunks
 * compose through OpenTUI's `t` tagged template:
 *
 *   emit(t`${style.green("✓")} Listo — ${style.bold(name)} instalado.`)
 *
 * The renderer turns that into real colored cells; `plainOf()` flattens the
 * same value back to text for pipes, files and stderr.
 */

import { bold, dim, fg, italic, t, underline, type StyledText } from "@opentui/core";
import { palette } from "./theme.ts";

export { t, bold, dim, italic, underline };
export type { StyledText };

/** Anything the report/doc layers accept as a printable line. */
export type Styleable = string | StyledText;

export const style = {
  bold,
  dim,
  italic,
  underline,
  cyan: fg(palette.cyan),
  green: fg(palette.green),
  yellow: fg(palette.amber),
  red: fg(palette.red),
  gold: fg(palette.gold),
  cream: fg(palette.cream),
  white: fg(palette.white),
  muted: fg(palette.muted),
  faint: fg(palette.faint),
};

/**
 * Flatten a `StyledText`, chunk, or string to plain text.
 */
export function plainOf(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;

  const chunks = (value as { chunks?: { text?: unknown }[] }).chunks;
  if (Array.isArray(chunks)) {
    return chunks.map((chunk) => plainOf(chunk?.text ?? "")).join("");
  }

  if (value instanceof Uint8Array) return new TextDecoder().decode(value);
  if (typeof value === "object" && "text" in value) {
    return plainOf((value as { text: unknown }).text);
  }

  return String(value);
}
