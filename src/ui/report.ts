/**
 * Buffered status output for side-effecting commands (`art`, `update`,
 * `doctor`, `completion`).
 *
 * Those commands emit a handful of progress lines. Spinning up a renderer per
 * line would be wasteful, so lines are buffered and flushed as one document.
 *
 * stdout goes through OpenTUI. stderr stays plain text on purpose: keeping it
 * unstyled preserves `2>` redirection and `grep` on error output.
 */

import { printDoc } from "./app.ts";
import { rich } from "./doc.ts";
import { plainOf, type Styleable } from "./style.ts";

let buffer: Styleable[] = [];

/** Queue a line for stdout. Accepts a plain string or a `StyledText`. */
export function emit(value: Styleable = ""): void {
  buffer.push(value);
}

/** Queue an empty line. */
export function emitBlank(): void {
  buffer.push("");
}

/** Write immediately to stderr as plain text. */
export function emitErr(value: unknown = ""): void {
  console.error(plainOf(value));
}

/** Drop anything buffered without printing (used by `--json` paths). */
export function resetReport(): void {
  buffer = [];
}

/** Flush buffered stdout lines. Styled in a terminal, plain text in a pipe. */
export async function flushReport({ plain = false } = {}): Promise<void> {
  if (buffer.length === 0) return;
  const lines = buffer;
  buffer = [];
  await printDoc(lines.map((line) => rich(line)), { plain });
}
