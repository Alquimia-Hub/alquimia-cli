#!/usr/bin/env node

/**
 * Friendly tip after `npm install -g ...`.
 * Never fails the install; stays quiet in CI / silent npm.
 * Does not require the `alquimia` binary on PATH.
 */

try {
  const loglevel = String(process.env.npm_config_loglevel || "").toLowerCase();
  const silent =
    process.env.CI === "true" ||
    process.env.CI === "1" ||
    loglevel === "silent" ||
    loglevel === "error";

  if (silent) {
    process.exit(0);
  }

  // Plain Node cannot import the TypeScript sources, so the command list is
  // read from the JSON both this script and src/commands.ts share.
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");

  const here = dirname(fileURLToPath(import.meta.url));
  const commands = JSON.parse(
    readFileSync(join(here, "..", "src", "commands.json"), "utf8")
  );

  const width = Math.max(...commands.map((c) => c.name.length));
  const rows = commands.map((c) => `  ${c.name.padEnd(width)}  ${c.blurb}`);

  // This script runs under whatever installed the package (often plain Node),
  // so it can only *check* for Bun — the CLI itself refuses to start without it.
  const { spawnSync } = await import("node:child_process");
  const hasBun =
    typeof globalThis.Bun !== "undefined" ||
    spawnSync("bun", ["--version"], { stdio: "ignore" }).status === 0;

  // Bun ships as an optional dependency, so a missing one is only worth
  // mentioning when that download did not land for this platform.
  const bunNotice = hasBun
    ? []
    : [
        "⚠  No encontré Bun. La UI usa OpenTUI, que necesita FFI nativo.",
        "   Se instala solo como dependencia; si falló:",
        "   curl -fsSL https://bun.sh/install | bash",
        "",
      ];

  console.log(
    [
      "",
      "🧪 Alquimia CLI instalada",
      "",
      ...bunNotice,
      "Probá:",
      ...rows,
      "",
      "Ayuda: alquimia help",
      "",
    ].join("\n")
  );
} catch {
  // Never break installs because of a tip message.
}

process.exit(0);
