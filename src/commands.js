import { style } from "./style.js";

/**
 * Single source of truth for CLI commands + blurbs.
 * Used by help, `alquimia info`, postinstall, and kept in sync with README.
 */
export const commands = [
  {
    name: "info",
    usage: "info",
    blurb:
      "Qué es Alquimia, la descripción de la comunidad y links a web, GitHub, X, Discord y WhatsApp",
  },
  {
    name: "join",
    usage: "join [red]",
    blurb:
      "Menú para sumarte; abrí Discord (recomendado), WhatsApp, X, GitHub o la web",
  },
  {
    name: "events",
    usage: "events",
    blurb:
      "Calls de lun/mié 17:00 ARG; en TTY elegí con ↑↓ y Enter abre el evento en Discord",
  },
  {
    name: "tools",
    usage: "tools [sección]",
    blurb:
      "Catálogo de tools; en TTY: sección → tool → acción (abrir docs o instalar). Esc/q vuelve un nivel",
  },
  {
    name: "art",
    usage: "art [--clear|clear] [--open] [--path]",
    blurb:
      "Fondo de terminal con el brand art (iTerm2/Kitty); `--clear` / `clear` lo saca, `--open` abre el PNG, `--path` imprime la ruta",
  },
  {
    name: "open",
    usage: "open <red>",
    blurb:
      "Abrí una red puntual en el navegador (`open discord`, `open x`, etc.)",
  },
  {
    name: "update",
    usage: "update",
    blurb:
      "Actualizá la CLI ahora (también se auto-actualiza en segundo plano al arrancar)",
  },
  {
    name: "help",
    usage: "help",
    blurb: "Ayuda completa con opciones y alias",
  },
  {
    name: "version",
    usage: "version",
    blurb: "Versión instalada de la CLI",
  },
];

export const commandNames = commands.map((c) => c.name);

function nameWidth(useUsage) {
  return Math.max(
    ...commands.map((c) => (useUsage ? c.usage : c.name).length)
  );
}

/**
 * Compact cheat-sheet lines (no heading).
 * @param {{ colored?: boolean, useUsage?: boolean }} [opts]
 * @returns {string[]}
 */
export function formatCommandRows({ colored = true, useUsage = false } = {}) {
  const width = nameWidth(useUsage);
  return commands.map((cmd) => {
    const left = (useUsage ? cmd.usage : cmd.name).padEnd(width);
    const name = colored ? style.cyan(left) : left;
    return `  ${name}  ${cmd.blurb}`;
  });
}

/**
 * Heading + command rows for human terminal output.
 * @param {{ colored?: boolean, heading?: string, useUsage?: boolean }} [opts]
 * @returns {string[]}
 */
export function formatCommandsBlock({
  colored = true,
  heading = "Comandos",
  useUsage = false,
} = {}) {
  const title = colored ? style.bold(heading) : heading;
  return [title, ...formatCommandRows({ colored, useUsage })];
}

/**
 * Plain-text cheat-sheet for postinstall / docs (no ANSI).
 * @returns {string}
 */
export function formatCommandsPlain({ heading = "Comandos" } = {}) {
  return formatCommandsBlock({ colored: false, heading }).join("\n");
}
