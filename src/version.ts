import pkg from "../package.json" with { type: "json" };

/**
 * Installed CLI version.
 *
 * Read via a JSON import rather than `readFileSync(import.meta.url…)` so it
 * resolves the same whether the CLI runs from source or from a bundle, where
 * there is no `package.json` on disk next to the module.
 */
export function getVersion(): string {
  return pkg.version;
}
