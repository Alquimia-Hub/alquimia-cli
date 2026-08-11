import { renderBanner } from "./banner.js";
import {
  community,
  linkAliases,
  linkLabels,
  linkOrder,
  resolveLinkKey,
} from "./community.js";
import { openUrl } from "./open-url.js";
import { closest } from "./suggest.js";
import { style } from "./style.js";
import { getVersion } from "./version.js";

const COMMANDS = ["info", "open", "help", "version"];

function bannerBlock({ noBanner = false } = {}) {
  if (noBanner) return "";
  return ["", renderBanner(), ""].join("\n");
}

function helpText({ noBanner = false } = {}) {
  const pad = (name, desc) => `  ${style.cyan(name.padEnd(18))} ${desc}`;

  return [
    bannerBlock({ noBanner }).trimEnd(),
    "",
    style.dim(community.tagline),
    "",
    style.bold("Uso"),
    `  alquimia ${style.dim("[comando] [opciones]")}`,
    "",
    style.bold("Comandos"),
    pad("info", "Descripción y redes de la comunidad"),
    pad("open <red>", "Abrí una red en el navegador"),
    pad("help", "Mostrá esta ayuda"),
    pad("version", "Mostrá la versión"),
    "",
    style.bold("Opciones"),
    pad("-h, --help", "Ayuda"),
    pad("-v, --version", "Versión"),
    pad("--json", "Salida JSON (con info)"),
    pad("--no-banner", "Ocultá el banner ASCII"),
    "",
    style.bold("Redes para open"),
    `  ${linkOrder.map((k) => style.cyan(k)).join(" · ")}`,
    style.dim("  alias: site→web, x→twitter, gh→github, wa→whatsapp"),
    "",
    style.bold("Ejemplos"),
    "  alquimia info",
    "  alquimia info --json",
    "  alquimia open discord",
    "  alquimia open x",
    "",
  ].join("\n");
}

function printInfo({ json = false, noBanner = false } = {}) {
  if (json) {
    console.log(JSON.stringify(community, null, 2));
    return;
  }

  const labelWidth = Math.max(...linkOrder.map((k) => linkLabels[k].length));
  const lines = [
    bannerBlock({ noBanner }).trimEnd(),
    "",
    style.cyan(community.tagline),
    "",
    community.description,
    "",
    style.bold("Redes"),
  ];

  for (const key of linkOrder) {
    const label = linkLabels[key].padEnd(labelWidth);
    lines.push(`  ${style.green(label)}  ${style.dim(community.links[key])}`);
  }

  lines.push("");
  console.log(lines.join("\n"));
}

async function runOpen(args) {
  const name = args.find((a) => !a.startsWith("-"));

  if (!name) {
    console.error(style.red("Falta la red a abrir.") + "\n");
    console.error(style.bold("Uso:") + " alquimia open <red>");
    console.error(
      style.bold("Redes:") +
        " " +
        linkOrder.join(", ") +
        style.dim(" (alias: site, x, gh, wa)")
    );
    process.exitCode = 1;
    return;
  }

  const key = resolveLinkKey(name);
  if (!key) {
    const suggestion = closest(name, [
      ...linkOrder,
      ...Object.keys(linkAliases),
    ]);
    console.error(style.red(`No conozco la red "${name}".`));
    if (suggestion) {
      console.error(style.yellow(`¿Quisiste decir "${suggestion}"?`));
    } else {
      console.error(
        style.dim(`Opciones: ${linkOrder.join(", ")} (alias: site, x, gh, wa)`)
      );
    }
    process.exitCode = 1;
    return;
  }

  const url = community.links[key];
  const label = linkLabels[key];

  try {
    await openUrl(url);
    console.log(
      `${style.green("✓")} Abriendo ${style.bold(label)}…\n  ${style.dim(url)}`
    );
  } catch (err) {
    console.error(
      style.red(`No pude abrir el navegador: ${err.message}`)
    );
    console.error(style.dim(`URL: ${url}`));
    process.exitCode = 1;
  }
}

function parseArgs(argv) {
  const flags = new Set();
  const positionals = [];

  for (const arg of argv) {
    if (arg.startsWith("-")) {
      flags.add(arg);
    } else {
      positionals.push(arg);
    }
  }

  return { flags, positionals };
}

export async function run(argv) {
  const { flags, positionals } = parseArgs(argv);
  const noBanner = flags.has("--no-banner");

  if (flags.has("-h") || flags.has("--help")) {
    console.log(helpText({ noBanner }));
    return;
  }

  if (flags.has("-v") || flags.has("--version")) {
    console.log(getVersion());
    return;
  }

  const [cmd, ...rest] = positionals;

  if (!cmd) {
    console.log(helpText({ noBanner }));
    return;
  }

  if (cmd === "help") {
    console.log(helpText({ noBanner }));
    return;
  }

  if (cmd === "version") {
    console.log(getVersion());
    return;
  }

  if (cmd === "info") {
    printInfo({ json: flags.has("--json"), noBanner });
    return;
  }

  if (cmd === "open") {
    await runOpen(rest);
    return;
  }

  const suggestion = closest(cmd, COMMANDS);
  console.error(style.red(`Comando desconocido: ${cmd}`));
  if (suggestion) {
    console.error(style.yellow(`¿Quisiste decir "${suggestion}"?`));
  }
  console.error(style.dim("Probá: alquimia --help"));
  process.exitCode = 1;
}
