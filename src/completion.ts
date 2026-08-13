import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { style, t } from "./ui/style.ts";
import { emitErr } from "./ui/report.ts";

const SHELLS = ["zsh", "bash", "fish"];

/**
 * @param {string} shell
 * @returns {string}
 */
export function completionScriptPath(shell: string): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "completions", shell);
}

/**
 * @param {string} shell
 * @returns {string}
 */
export function loadCompletionScript(shell: string): string {
  const path = completionScriptPath(shell);
  return readFileSync(path, "utf8");
}

/**
 * Print shell completion script to stdout.
 * @param {string[]} args positional after `completion`
 */
export function runCompletion(args: string[] = []): void {
  const shell = String(args.find((a) => !a.startsWith("-")) || "")
    .trim()
    .toLowerCase();

  if (!shell || !SHELLS.includes(shell)) {
    emitErr(t`${style.red("Falta el shell, o no lo conozco.")}`);
    emitErr(t`${style.bold("Uso:")} alquimia completion <zsh|bash|fish>`);
    emitErr(t`${style.dim(
        "Ej: alquimia completion zsh > ~/.zsh/completions/_alquimia"
      )}`);
    process.exitCode = 1;
    return;
  }

  try {
    process.stdout.write(loadCompletionScript(shell));
  } catch (err) {
    emitErr(t`${style.red(
        `No pude leer el script de completion: ${
          err instanceof Error ? err.message : String(err)
        }`
      )}`);
    process.exitCode = 1;
  }
}

export const completionShells = SHELLS;
