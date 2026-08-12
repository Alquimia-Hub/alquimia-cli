import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { style } from "./style.js";

const SHELLS = ["zsh", "bash", "fish"];

/**
 * @param {string} shell
 * @returns {string}
 */
export function completionScriptPath(shell) {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "completions", shell);
}

/**
 * @param {string} shell
 * @returns {string}
 */
export function loadCompletionScript(shell) {
  const path = completionScriptPath(shell);
  return readFileSync(path, "utf8");
}

/**
 * Print shell completion script to stdout.
 * @param {string[]} args positional after `completion`
 */
export function runCompletion(args = []) {
  const shell = String(args.find((a) => !a.startsWith("-")) || "")
    .trim()
    .toLowerCase();

  if (!shell || !SHELLS.includes(shell)) {
    console.error(style.red("Falta el shell, o no lo conozco."));
    console.error(style.bold("Uso:") + " alquimia completion <zsh|bash|fish>");
    console.error(
      style.dim(
        "Ej: alquimia completion zsh > ~/.zsh/completions/_alquimia"
      )
    );
    process.exitCode = 1;
    return;
  }

  try {
    process.stdout.write(loadCompletionScript(shell));
  } catch (err) {
    console.error(
      style.red(
        `No pude leer el script de completion: ${
          err instanceof Error ? err.message : String(err)
        }`
      )
    );
    process.exitCode = 1;
  }
}

export const completionShells = SHELLS;
