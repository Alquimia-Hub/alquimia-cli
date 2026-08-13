#!/usr/bin/env node

/**
 * Node-compatible bootstrap.
 *
 * The CLI itself runs on Bun — OpenTUI's renderer needs native FFI that Node
 * cannot provide. But `npx` always launches the bin with **Node**, so this
 * file has to be plain JavaScript that Node can parse.
 *
 * It finds a Bun binary and re-execs the real entry point under it:
 *
 *   1. already running under Bun  → import the entry directly, no extra process
 *   2. `ALQUIMIA_BUN` env var     → explicit override
 *   3. `bun` on PATH              → the user already has Bun
 *   4. the `bun` npm package      → optional dependency, so `npx alquimia-cli`
 *                                   works with nothing installed beforehand
 *
 * Without this, the shebang alone (`#!/usr/bin/env bun`) fails on a machine
 * without Bun with a bare `env: bun: No such file or directory`.
 */

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, "alquimia.ts");
const args = process.argv.slice(2);

// 1. Already on Bun (e.g. `bunx alquimia-cli`): skip the extra process.
if (typeof globalThis.Bun !== "undefined") {
  const { run } = await import("../src/cli.ts");
  await run(args);
} else {
  const bun = resolveBun();

  if (!bun) {
    process.stderr.write(
      [
        "alquimia necesita Bun para correr (la UI usa OpenTUI, que requiere FFI nativo).",
        "",
        "Opciones:",
        "  bunx alquimia-cli                        (si ya tenés Bun)",
        "  curl -fsSL https://bun.sh/install | bash (instalar Bun)",
        "",
        "O reinstalá el paquete para que baje Bun solo:",
        "  npm install -g alquimia-cli",
        "",
      ].join("\n"),
    );
    process.exit(1);
  }

  const result = spawnSync(bun, [entry, ...args], {
    stdio: "inherit", // The TUI needs the real TTY on both ends.
    env: process.env,
  });

  if (result.error) {
    process.stderr.write(`No pude ejecutar Bun (${bun}): ${result.error.message}\n`);
    process.exit(1);
  }

  process.exit(result.status ?? 1);
}

/** Candidate Bun binaries, most preferred first. */
function* bunCandidates() {
  if (process.env.ALQUIMIA_BUN) yield process.env.ALQUIMIA_BUN;

  yield "bun"; // on PATH

  const require = createRequire(import.meta.url);
  const fromPackage = (name, ...rel) => {
    try {
      return join(dirname(require.resolve(`${name}/package.json`)), ...rel);
    } catch {
      return null;
    }
  };

  // The `bun` package's postinstall drops the real binary here.
  yield fromPackage("bun", "bin", "bun.exe");
  yield fromPackage("bun", "bin", "bun");

  // With `--ignore-scripts` that postinstall never runs and `bin/bun.exe` is a
  // placeholder shell script, so fall back to the platform package directly.
  const arch =
    process.arch === "arm64" ? "aarch64" : process.arch === "x64" ? "x64" : null;
  const os =
    process.platform === "darwin"
      ? "darwin"
      : process.platform === "linux"
        ? "linux"
        : process.platform === "win32"
          ? "windows"
          : null;

  if (os && arch) {
    for (const suffix of ["", "-musl", "-baseline"]) {
      yield fromPackage(`@oven/bun-${os}-${arch}${suffix}`, "bin", "bun");
      yield fromPackage(`@oven/bun-${os}-${arch}${suffix}`, "bin", "bun.exe");
    }
  }
}

/**
 * @returns {string | null} a Bun binary that actually runs
 *
 * Each candidate is verified with `--version` rather than an existence check:
 * the `bun` package ships a placeholder at `bin/bun.exe` that exists but
 * fails with ENOEXEC when its postinstall was skipped.
 */
function resolveBun() {
  for (const candidate of bunCandidates()) {
    if (!candidate) continue;
    if (candidate !== "bun" && !existsSync(candidate)) continue;

    const probe = spawnSync(candidate, ["--version"], { stdio: "ignore" });
    if (!probe.error && probe.status === 0) return candidate;
  }
  return null;
}
