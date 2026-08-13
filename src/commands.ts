import type { CommandSpec } from "./types.ts";
import commandsData from "./commands.json" with { type: "json" };

/**
 * Single source of truth for CLI commands + blurbs.
 *
 * The list lives in `commands.json` rather than inline because
 * `scripts/postinstall.js` runs under plain Node during `npm install` and
 * cannot import TypeScript. Data as data keeps both readers honest.
 */
export const commands: readonly CommandSpec[] = commandsData;

export const commandNames: readonly string[] = commands.map((c) => c.name);

function nameWidth(useUsage: boolean): number {
  return Math.max(...commands.map((c) => (useUsage ? c.usage : c.name).length));
}

export interface CommandRow {
  key: string;
  value: string;
}

/**
 * Command rows as `kv` block data for the UI layer.
 */
export function commandRows({ useUsage = false } = {}): CommandRow[] {
  return commands.map((cmd) => ({
    key: useUsage ? cmd.usage : cmd.name,
    value: cmd.blurb,
  }));
}

/**
 * Compact cheat-sheet lines, plain text (no ANSI).
 */
export function formatCommandRows({ useUsage = false } = {}): string[] {
  const width = nameWidth(useUsage);
  return commands.map((cmd) => {
    const left = (useUsage ? cmd.usage : cmd.name).padEnd(width);
    return `  ${left}  ${cmd.blurb}`;
  });
}

/**
 * Plain-text cheat-sheet for docs.
 */
export function formatCommandsPlain({ heading = "Comandos" } = {}): string {
  return [heading, ...formatCommandRows()].join("\n");
}
