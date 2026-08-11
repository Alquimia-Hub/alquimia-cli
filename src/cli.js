import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { renderBanner } from "./banner.js";
import {
  community,
  getNextCommunityCall,
  joinOptions,
  linkAliases,
  linkLabels,
  linkOrder,
  resolveLinkKey,
} from "./community.js";
import { openUrl } from "./open-url.js";
import { closest } from "./suggest.js";
import { style } from "./style.js";
import { getVersion } from "./version.js";

const COMMANDS = ["info", "open", "join", "events", "help", "version"];

function bannerBlock({ noBanner = false } = {}) {
  if (noBanner) return "";
  return ["", renderBanner(), ""].join("\n");
}

/** Prepend banner + blank line when enabled; otherwise return lines as-is. */
function withBanner(lines, { noBanner = false } = {}) {
  const banner = bannerBlock({ noBanner }).trimEnd();
  if (!banner) return lines;
  return [banner, "", ...lines];
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
    pad("join [red]", "Sumate: menú o abrí una red directo"),
    pad("events", "Community calls (lunes y miércoles)"),
    pad("help", "Mostrá esta ayuda"),
    pad("version", "Mostrá la versión"),
    "",
    style.bold("Opciones"),
    pad("-h, --help", "Ayuda"),
    pad("-v, --version", "Versión"),
    pad("--json", "Salida JSON (info, join, events)"),
    pad("--no-banner", "Ocultá el banner ASCII"),
    "",
    style.bold("Redes para open / join"),
    `  ${linkOrder.map((k) => style.cyan(k)).join(" · ")}`,
    style.dim("  alias: site→web, x→twitter, gh→github, wa→whatsapp"),
    "",
    style.bold("Ejemplos"),
    "  alquimia info",
    "  alquimia info --json",
    "  alquimia open discord",
    "  alquimia open x",
    "  alquimia join",
    "  alquimia join discord",
    "  alquimia events",
    "  alquimia events --json",
    "",
  ].join("\n");
}

function printInfo({ json = false, noBanner = false } = {}) {
  if (json) {
    console.log(JSON.stringify(community, null, 2));
    return;
  }

  const labelWidth = Math.max(...linkOrder.map((k) => linkLabels[k].length));
  const body = [
    style.cyan(community.tagline),
    "",
    community.description,
    "",
    style.bold("Redes"),
  ];

  for (const key of linkOrder) {
    const label = linkLabels[key].padEnd(labelWidth);
    body.push(`  ${style.green(label)}  ${style.dim(community.links[key])}`);
  }

  body.push("");
  console.log(withBanner(body, { noBanner }).join("\n"));
}

async function openNetwork(key) {
  const url = community.links[key];
  const label = linkLabels[key];

  try {
    await openUrl(url);
    console.log(
      `${style.green("✓")} Abriendo ${style.bold(label)}…\n  ${style.dim(url)}`
    );
  } catch (err) {
    console.error(style.red(`No pude abrir el navegador: ${err.message}`));
    console.error(style.dim(`URL: ${url}`));
    process.exitCode = 1;
  }
}

function unknownNetworkError(name) {
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
    unknownNetworkError(name);
    return;
  }

  await openNetwork(key);
}

function joinMenuLines() {
  const lines = [
    style.bold("¿Por dónde te sumás?"),
    style.dim("Discord es lo más completo (calls + canales). WhatsApp es más liviano."),
    "",
  ];

  joinOptions.forEach((opt, i) => {
    const n = String(i + 1);
    const label = linkLabels[opt.key];
    lines.push(
      `  ${style.cyan(n)}. ${style.bold(label)}  ${style.dim(opt.blurb)}`
    );
    lines.push(`     ${style.dim(community.links[opt.key])}`);
  });

  lines.push("");
  return lines;
}

function printJoinList({ json = false, noBanner = false } = {}) {
  if (json) {
    const payload = {
      default: "discord",
      options: joinOptions.map((opt) => ({
        key: opt.key,
        label: linkLabels[opt.key],
        blurb: opt.blurb,
        url: community.links[opt.key],
      })),
      links: community.links,
    };
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(withBanner(joinMenuLines(), { noBanner }).join("\n"));
}

async function promptJoinChoice() {
  const rl = createInterface({ input, output });
  try {
    const answer = (
      await rl.question(
        style.cyan("Elegí un número (o Enter para Discord): ")
      )
    ).trim();

    if (answer === "") return "discord";

    const n = Number.parseInt(answer, 10);
    if (!Number.isFinite(n) || n < 1 || n > joinOptions.length) {
      console.error(
        style.red(
          `Número inválido. Usá 1–${joinOptions.length}, o Enter para Discord.`
        )
      );
      process.exitCode = 1;
      return null;
    }
    return joinOptions[n - 1].key;
  } finally {
    rl.close();
  }
}

async function runJoin(args, { json = false, noBanner = false } = {}) {
  const name = args.find((a) => !a.startsWith("-"));

  if (name) {
    const key = resolveLinkKey(name);
    if (!key) {
      unknownNetworkError(name);
      return;
    }
    if (!json) {
      const headed = withBanner([], { noBanner });
      if (headed.length) console.log(headed.join("\n"));
    }
    await openNetwork(key);
    return;
  }

  // List / menu mode
  if (json || !input.isTTY) {
    printJoinList({ json, noBanner });
    return;
  }

  console.log(withBanner(joinMenuLines(), { noBanner }).join("\n"));

  const key = await promptJoinChoice();
  if (!key) return;
  await openNetwork(key);
}

function formatEventWhen(event) {
  const day = event.weekday.charAt(0).toUpperCase() + event.weekday.slice(1);
  return `${day} ${event.time} ARG (UTC-3)`;
}

function printEvents({ json = false, noBanner = false } = {}) {
  const next = getNextCommunityCall();

  if (json) {
    const payload = {
      timezone: "America/Argentina/Buenos_Aires",
      place: "Discord",
      discord: community.links.discord,
      note: community.scheduleNote,
      next: next
        ? {
            id: next.event.id,
            name: next.event.name,
            weekday: next.event.weekday,
            time: next.event.time,
            at: next.at.toISOString(),
          }
        : null,
      events: community.events,
    };
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const body = [
    style.bold("Community calls"),
    style.dim("Recurrentes · voz en Discord · horario ARG (UTC-3)"),
    "",
  ];

  for (const event of community.events) {
    const isNext = next && next.event.id === event.id;
    const marker = isNext ? style.green("→ ") : "  ";
    const title = isNext
      ? style.bold(style.green(event.name))
      : style.bold(event.name);
    const when = formatEventWhen(event);
    const tag = isNext ? `  ${style.yellow("(próxima)")}` : "";

    body.push(`${marker}${title}${tag}`);
    body.push(`    ${style.cyan(when)}`);
    body.push(`    ${style.dim(`Dónde: ${event.place}`)}`);
    body.push("");
  }

  body.push(style.bold("Discord"));
  body.push(`  ${style.dim(community.links.discord)}`);
  body.push("");
  if (community.scheduleNote) {
    body.push(style.dim(community.scheduleNote));
    body.push("");
  }

  console.log(withBanner(body, { noBanner }).join("\n"));
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
  const json = flags.has("--json");

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
    printInfo({ json, noBanner });
    return;
  }

  if (cmd === "open") {
    await runOpen(rest);
    return;
  }

  if (cmd === "join") {
    await runJoin(rest, { json, noBanner });
    return;
  }

  if (cmd === "events") {
    printEvents({ json, noBanner });
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
