#!/usr/bin/env bun

/**
 * Alquimia CLI entrypoint.
 *
 * The UI is built on OpenTUI, whose renderer needs native FFI. Bun provides
 * it; Node does not (Node needs 26.4.0 with `--experimental-ffi`, which npm's
 * global bin shim cannot pass). Rather than crash deep inside the renderer,
 * detect the runtime here and print an actionable message.
 */

if (typeof Bun === "undefined") {
  process.stderr.write(
    [
      "alquimia necesita Bun para correr (la UI usa OpenTUI, que requiere FFI nativo).",
      "",
      "Instalá Bun y volvé a intentar:",
      "  curl -fsSL https://bun.sh/install | bash",
      "",
      "Después: bun install -g github:Alquimia-Hub/alquimia-cli",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

const { run } = await import("../src/cli.ts");

await run(process.argv.slice(2));

export {};
