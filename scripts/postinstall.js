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

  const { formatCommandRows } = await import("../src/commands.js");

  const rows = formatCommandRows({ colored: false, useUsage: false });

  console.log(
    [
      "",
      "🧪 Alquimia CLI instalada",
      "",
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
