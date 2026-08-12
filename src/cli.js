import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { renderBanner } from "./banner.js";
import { parseArtCliArgs, runArt } from "./art.js";
import { commandNames, formatCommandsBlock } from "./commands.js";
import { runCompletion } from "./completion.js";
import {
  community,
  getNextCommunityCall,
  joinOptions,
  linkAliases,
  linkLabels,
  linkOrder,
  resolveEventUrl,
  resolveLinkKey,
} from "./community.js";
import { runDoctor } from "./doctor.js";
import { openUrl } from "./open-url.js";
import { select } from "./select.js";
import { closest } from "./suggest.js";
import { style } from "./style.js";
import {
  findToolSection,
  isToolOpenable,
  normalizeInstall,
  toolHasInstall,
  toolSections,
  toolsCatalogPayload,
} from "./tools.js";
import {
  isAutoUpdateDisabled,
  maybeAutoUpdate,
  runUpdateCommand,
} from "./update.js";
import { getVersion } from "./version.js";
import { playDino, runWithDino } from "./dino/game.js";

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
  return [
    bannerBlock({ noBanner }).trimEnd(),
    "",
    style.dim(community.tagline),
    "",
    style.bold("Uso"),
    `  alquimia ${style.dim("[comando] [opciones]")}`,
    "",
    ...formatCommandsBlock({ colored: true, useUsage: true }),
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

  body.push(
    "",
    ...formatCommandsBlock({ colored: true, heading: "Comandos" }),
    "",
    style.dim("Tip: alquimia help para más."),
    ""
  );
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

async function runJoin(
  args,
  { json = false, noBanner = false, noInteractive = false } = {}
) {
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
  if (json || noInteractive || !input.isTTY) {
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

function eventListBody(next = getNextCommunityCall()) {
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
  body.push(
    `  ${style.dim(community.discord?.invite ?? community.links.discord)}`
  );
  body.push("");
  if (community.scheduleNote) {
    body.push(style.dim(community.scheduleNote));
    body.push("");
  }

  return body;
}

function printEvents({ json = false, noBanner = false } = {}) {
  const next = getNextCommunityCall();

  if (json) {
    const payload = {
      timezone: "America/Argentina/Buenos_Aires",
      place: "Discord",
      discord: {
        invite: community.discord?.invite ?? community.links.discord,
        guildId: community.discord?.guildId ?? null,
        eventsChannelUrl: community.discord?.eventsChannelUrl ?? null,
      },
      note: community.scheduleNote,
      next: next
        ? {
            id: next.event.id,
            name: next.event.name,
            weekday: next.event.weekday,
            time: next.event.time,
            at: next.at.toISOString(),
            url: resolveEventUrl(next.event),
          }
        : null,
      events: community.events,
    };
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(withBanner(eventListBody(next), { noBanner }).join("\n"));
}

async function openEventUrl(event, { quiet = false } = {}) {
  const url = resolveEventUrl(event);
  const label = event?.name
    ? `${event.name} (${formatEventWhen(event)})`
    : "Discord";

  try {
    await openUrl(url);
    if (!quiet) {
      console.log(
        `${style.green("✓")} Abriendo ${style.bold(label)}…\n  ${style.dim(url)}`
      );
    }
  } catch (err) {
    console.error(style.red(`No pude abrir el navegador: ${err.message}`));
    console.error(style.dim(`URL: ${url}`));
    process.exitCode = 1;
  }
}

async function runEventsInteractive({ noBanner = false } = {}) {
  const next = getNextCommunityCall();
  const events = community.events ?? [];
  if (events.length === 0) {
    printEvents({ noBanner });
    return;
  }

  const initialIndex = next
    ? Math.max(
        0,
        events.findIndex((e) => e.id === next.event.id)
      )
    : 0;

  const headed = withBanner(
    [
      style.bold("Community calls"),
      style.dim("Recurrentes · voz en Discord · horario ARG (UTC-3)"),
      "",
    ],
    { noBanner }
  );
  console.log(headed.join("\n"));

  const labels = events.map((event) => {
    const when = formatEventWhen(event);
    const isNext = next && next.event.id === event.id;
    return isNext
      ? `${event.name} · ${when}  (próxima)`
      : `${event.name} · ${when}`;
  });

  const picked = await select(labels, {
    initialIndex,
    hint: "↑↓ para elegir · Enter para abrir Discord · q para salir",
    renderItem: (item, index, selected) => {
      const event = events[index];
      const isNext = next && next.event.id === event.id;
      const when = formatEventWhen(event);
      const nextTag = isNext ? `  ${style.yellow("(próxima)")}` : "";
      const name = isNext
        ? style.bold(style.green(event.name))
        : style.bold(event.name);
      const whenColored = style.cyan(when);

      if (selected) {
        return `${style.cyan("❯")} ${name}${nextTag}\n    ${whenColored}`;
      }
      return `  ${name}${nextTag}\n    ${style.dim(when)}`;
    },
  });

  if (picked == null) {
    console.log(style.dim("Cancelado."));
    return;
  }

  await openEventUrl(events[picked]);
}

async function runEvents({
  json = false,
  noBanner = false,
  noInteractive = false,
  listOnly = false,
  openOnly = false,
} = {}) {
  if (json || listOnly || noInteractive) {
    printEvents({ json, noBanner });
    return;
  }

  const next = getNextCommunityCall();

  if (openOnly) {
    const headed = withBanner([], { noBanner });
    if (headed.length) console.log(headed.join("\n"));
    const target = next?.event ?? community.events[0];
    if (!target) {
      console.error(style.red("No hay events configurados."));
      process.exitCode = 1;
      return;
    }
    await openEventUrl(target);
    return;
  }

  if (!input.isTTY || !output.isTTY) {
    printEvents({ json: false, noBanner });
    return;
  }

  await runEventsInteractive({ noBanner });
}

const TOOLS_HINT = "↑↓ · Enter · escribí para filtrar · Esc limpia/vuelve";
const TOOLS_HINT_SIMPLE = "↑↓ · Enter · Esc/q para volver";

function toolsListBody(sectionFilter = null) {
  const sections = sectionFilter ? [sectionFilter] : toolSections;
  const body = [
    style.bold("Catálogo de tools"),
    style.dim("Recomendaciones de la comunidad · links + install (si hay)"),
    "",
  ];

  for (const section of sections) {
    body.push(style.bold(section.name));
    body.push(`  ${style.dim(section.blurb)}`);
    body.push(`  ${style.cyan(`id: ${section.id}`)}`);
    body.push("");

    for (const tool of section.tools) {
      const soon = Boolean(tool.comingSoon || !tool.url);
      const tag = soon ? `  ${style.yellow("(próximamente)")}` : "";
      body.push(`  ${style.green("·")} ${style.bold(tool.name)}${tag}`);
      body.push(`    ${style.dim(tool.blurb)}`);
      if (tool.url) {
        body.push(`    ${style.dim(tool.url)}`);
      }
      const install = normalizeInstall(tool);
      if (install?.global) {
        body.push(`    ${style.dim(`install global: ${install.global}`)}`);
      }
      if (install?.project) {
        body.push(`    ${style.dim(`install proyecto: ${install.project}`)}`);
      }
      if (install?.note) {
        body.push(`    ${style.dim(`nota: ${install.note}`)}`);
      }
      body.push("");
    }
  }

  if (!sectionFilter) {
    body.push(
      style.dim("Tip: alquimia tools <sección> para saltar a una categoría.")
    );
    body.push("");
  }

  return body;
}

function printTools({ json = false, noBanner = false, section = null } = {}) {
  if (json) {
    const payload = toolsCatalogPayload();
    if (section) {
      const match = payload.sections.find((s) => s.id === section.id);
      console.log(
        JSON.stringify(
          {
            section: match ?? null,
            sections: match ? [match] : [],
          },
          null,
          2
        )
      );
      return;
    }
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(
    withBanner(toolsListBody(section), { noBanner }).join("\n")
  );
}

function unknownSectionError(name) {
  const ids = toolSections.map((s) => s.id);
  const suggestion = closest(name, ids);
  console.error(style.red(`No conozco la sección "${name}".`));
  if (suggestion) {
    console.error(style.yellow(`¿Quisiste decir "${suggestion}"?`));
  } else {
    console.error(style.dim(`Secciones: ${ids.join(", ")}`));
  }
  process.exitCode = 1;
}

async function openToolUrl(tool) {
  if (!isToolOpenable(tool)) {
    console.log(style.yellow("Todavía no cargamos el link — pronto."));
    if (tool?.blurb) {
      console.log(style.dim(`  ${tool.name}: ${tool.blurb}`));
    }
    return false;
  }

  const url = tool.url;
  try {
    await openUrl(url);
    console.log(
      `${style.green("✓")} Abriendo ${style.bold(tool.name)}…\n  ${style.dim(url)}`
    );
    return true;
  } catch (err) {
    console.error(style.red(`No pude abrir el navegador: ${err.message}`));
    console.error(style.dim(`URL: ${url}`));
    process.exitCode = 1;
    return false;
  }
}

/**
 * Run a static catalog shell command (never remote eval).
 * @param {string} command
 * @param {{ cwd?: string, stdio?: import('node:child_process').StdioOptions }} [opts]
 * @returns {Promise<{ ok: boolean, code: number, stdout?: string, stderr?: string }>}
 */
function runInstallCommand(
  command,
  { cwd = process.cwd(), stdio = "inherit" } = {}
) {
  return new Promise((resolve) => {
    const child = spawn(command, {
      shell: true,
      stdio,
      cwd,
      env: process.env,
    });

    let capturedOut = "";
    let capturedErr = "";
    if (child.stdout && typeof child.stdout.on === "function") {
      child.stdout.on("data", (buf) => {
        capturedOut += String(buf);
      });
    }
    if (child.stderr && typeof child.stderr.on === "function") {
      child.stderr.on("data", (buf) => {
        capturedErr += String(buf);
      });
    }

    child.once("error", (err) => {
      console.error(style.red(`No pude ejecutar el comando: ${err.message}`));
      resolve({ ok: false, code: 1, stdout: capturedOut, stderr: capturedErr });
    });

    child.once("close", (code) => {
      const exit = typeof code === "number" ? code : 1;
      resolve({
        ok: exit === 0,
        code: exit,
        stdout: capturedOut,
        stderr: capturedErr,
      });
    });
  });
}

/**
 * Confirm + run an install command.
 * @returns {Promise<'done'|'back'>}
 */
async function confirmAndRunInstall(
  tool,
  command,
  { yes = false, noInteractive = false } = {}
) {
  console.log("");
  console.log(style.bold("Comando:"));
  console.log(`  ${style.cyan(command)}`);
  console.log(style.dim(`cwd: ${process.cwd()}`));
  console.log("");

  if (!yes) {
    const confirmIdx = await select(["Ejecutar", "Cancelar"], {
      hint: TOOLS_HINT_SIMPLE,
      renderItem: (item, _index, selected) =>
        selected
          ? `${style.cyan("❯")} ${style.bold(item)}`
          : `  ${item}`,
    });
    if (confirmIdx == null || confirmIdx === 1) {
      console.log(style.dim("Cancelado."));
      return "back";
    }
  }

  console.log(
    `${style.green("→")} Corriendo install de ${style.bold(tool.name)}…`
  );
  console.log("");

  const { result, playedDino, dinoScore } = await runWithDino(
    async ({ useDino }) => {
      const stdio = useDino ? ["ignore", "pipe", "pipe"] : "inherit";
      return runInstallCommand(command, { cwd: process.cwd(), stdio });
    },
    { noInteractive, env: process.env }
  );

  if (playedDino) {
    const combined = `${result.stdout || ""}${result.stderr || ""}`.trim();
    if (combined) console.log(combined);
    console.log(
      style.dim(`(Alquimia Runner — score mientras instalabas: ${dinoScore})`)
    );
  }

  if (result.ok) {
    console.log("");
    console.log(
      `${style.green("✓")} Listo — ${style.bold(tool.name)} instalado.`
    );
    return "done";
  }

  console.log("");
  console.error(
    style.red(
      `Falló el install (exit ${result.code}). Revisá el output de arriba.`
    )
  );
  if (tool.url) {
    console.error(style.dim(`Docs: ${tool.url}`));
  }
  process.exitCode = 1;
  return "done";
}

/**
 * Where to install: global vs project.
 * @returns {Promise<'done'|'back'>}
 */
async function pickInstallWhere(tool, { yes = false, noInteractive = false } = {}) {
  const install = normalizeInstall(tool);
  if (!install || (!install.global && !install.project)) {
    console.log(
      style.yellow("Todavía no hay comando de install configurado para esta tool.")
    );
    if (isToolOpenable(tool)) {
      console.log(style.dim("Podés abrir las docs desde el menú de acciones."));
    }
    return "back";
  }

  if (install.note) {
    console.log(style.dim(install.note));
    console.log("");
  }

  while (true) {
    const whereIdx = await select(["Global", "En este proyecto"], {
      hint: TOOLS_HINT_SIMPLE,
      renderItem: (item, index, selected) => {
        const detail =
          index === 0
            ? install.global
              ? style.dim(install.global)
              : style.yellow("no configurado")
            : install.project
              ? style.dim(install.project)
              : style.yellow("no configurado");
        if (selected) {
          return `${style.cyan("❯")} ${style.bold(item)}\n    ${detail}`;
        }
        return `  ${item}\n    ${detail}`;
      },
    });

    if (whereIdx == null) return "back";

    const wantGlobal = whereIdx === 0;
    const command = wantGlobal ? install.global : install.project;

    if (!command) {
      if (wantGlobal) {
        console.log(
          style.yellow(
            "No hay install global para esta tool. Probá «En este proyecto» o abrí las docs."
          )
        );
      } else {
        console.log(
          style.yellow(
            "Install en este proyecto no está disponible para esta tool."
          )
        );
      }
      console.log("");

      const fallbackLabels = [];
      const fallbackActions = [];
      if (wantGlobal && install.project) {
        fallbackLabels.push("Usar install de proyecto");
        fallbackActions.push("project");
      }
      if (!wantGlobal && install.global) {
        fallbackLabels.push("Usar install global");
        fallbackActions.push("global");
      }
      if (isToolOpenable(tool)) {
        fallbackLabels.push("Abrir docs");
        fallbackActions.push("docs");
      }
      fallbackLabels.push("Volver");
      fallbackActions.push("back");

      const fbIdx = await select(fallbackLabels, { hint: TOOLS_HINT_SIMPLE });
      if (fbIdx == null || fallbackActions[fbIdx] === "back") {
        continue;
      }
      const action = fallbackActions[fbIdx];
      if (action === "docs") {
        await openToolUrl(tool);
        return "done";
      }
      if (action === "global") {
        return confirmAndRunInstall(tool, install.global, { yes, noInteractive });
      }
      if (action === "project") {
        return confirmAndRunInstall(tool, install.project, { yes, noInteractive });
      }
      continue;
    }

    return confirmAndRunInstall(tool, command, { yes, noInteractive });
  }
}

/**
 * Action picker for one tool: open docs and/or install.
 * @returns {Promise<'done'|'back'>}
 */
async function pickToolAction(tool, { yes = false, noInteractive = false } = {}) {
  if (tool.comingSoon || (!isToolOpenable(tool) && !toolHasInstall(tool))) {
    console.log(
      style.yellow(
        `${tool.name} todavía no tiene acciones — pronto sumamos link e install.`
      )
    );
    if (tool.blurb) console.log(style.dim(`  ${tool.blurb}`));
    return "back";
  }

  while (true) {
    const actions = [];
    if (isToolOpenable(tool)) {
      actions.push({ id: "open", label: "Abrir repo / docs" });
    }
    if (toolHasInstall(tool)) {
      actions.push({ id: "install", label: "Instalar" });
    }

    if (actions.length === 0) {
      console.log(
        style.yellow(
          `${tool.name} todavía no tiene acciones — pronto sumamos link e install.`
        )
      );
      return "back";
    }

    console.log(
      [
        style.bold(tool.name),
        style.dim(tool.blurb),
        "",
      ].join("\n")
    );

    if (!toolHasInstall(tool)) {
      console.log(
        style.dim("Install aún no configurado en el catálogo — solo docs.")
      );
      console.log("");
    }

    const actionIdx = await select(
      actions.map((a) => a.label),
      {
        hint: TOOLS_HINT_SIMPLE,
        renderItem: (item, _index, selected) =>
          selected
            ? `${style.cyan("❯")} ${style.bold(item)}`
            : `  ${item}`,
      }
    );

    if (actionIdx == null) return "back";

    const action = actions[actionIdx];
    if (action.id === "open") {
      await openToolUrl(tool);
      return "done";
    }

    if (action.id === "install") {
      const result = await pickInstallWhere(tool, { yes, noInteractive });
      if (result === "back") {
        // Re-print tool header on next loop iteration.
        continue;
      }
      return result;
    }
  }
}

/**
 * Tool picker for one section. Returns:
 * - true  → user finished an action (open/install)
 * - false → user cancelled / went back
 */
async function pickToolInSection(section, { yes = false, noInteractive = false } = {}) {
  const tools = section.tools ?? [];
  if (tools.length === 0) {
    console.log(style.dim("Esta sección todavía no tiene tools."));
    return true;
  }

  while (true) {
    console.log(
      [style.bold(section.name), style.dim(section.blurb), ""].join("\n")
    );

    const labels = tools.map((t) => t.name);
    const picked = await select(labels, {
      hint: TOOLS_HINT,
      filterable: true,
      getFilterText: (_item, index) => {
        const tool = tools[index];
        return `${tool.name} ${tool.blurb ?? ""} ${tool.id ?? ""}`;
      },
      renderItem: (_item, index, selected) => {
        const tool = tools[index];
        const soon = Boolean(tool.comingSoon || !tool.url);
        const tag = soon ? `  ${style.yellow("(próximamente)")}` : "";
        const installTag =
          !soon && toolHasInstall(tool)
            ? `  ${style.dim("(install)")}`
            : "";
        const name = style.bold(tool.name);
        const blurb = style.dim(tool.blurb);

        if (selected) {
          return `${style.cyan("❯")} ${name}${tag}${installTag}\n    ${blurb}`;
        }
        return `  ${name}${tag}${installTag}\n    ${blurb}`;
      },
    });

    if (picked == null) return false;

    const result = await pickToolAction(tools[picked], { yes, noInteractive });
    if (result === "done") return true;
    // back → tool picker again
  }
}

async function runToolsInteractive({
  noBanner = false,
  section = null,
  yes = false,
  noInteractive = false,
} = {}) {
  const headed = withBanner(
    [
      style.bold("Catálogo de tools"),
      style.dim("Recomendaciones de la comunidad · elegí una sección"),
      "",
    ],
    { noBanner }
  );
  console.log(headed.join("\n"));

  // Jump straight into a section's tool picker when requested.
  if (section) {
    await pickToolInSection(section, { yes, noInteractive });
    return;
  }

  // Nested: sections → tools → actions; Esc/q goes back one level.
  while (true) {
    const sectionLabels = toolSections.map((s) => s.name);
    const sectionIdx = await select(sectionLabels, {
      hint: TOOLS_HINT,
      filterable: true,
      getFilterText: (_item, index) => {
        const s = toolSections[index];
        return `${s.name} ${s.blurb ?? ""} ${s.id ?? ""}`;
      },
      renderItem: (_item, index, selected) => {
        const s = toolSections[index];
        const name = style.bold(s.name);
        const blurb = style.dim(s.blurb);
        if (selected) {
          return `${style.cyan("❯")} ${name}\n    ${blurb}`;
        }
        return `  ${name}\n    ${blurb}`;
      },
    });

    if (sectionIdx == null) {
      console.log(style.dim("Listo."));
      return;
    }

    const chosen = toolSections[sectionIdx];
    const stayed = await pickToolInSection(chosen, { yes, noInteractive });
    if (stayed) return;

    // Back to sections — reprint the heading so the nested loop stays clear.
    console.log(
      [
        style.bold("Catálogo de tools"),
        style.dim("Recomendaciones de la comunidad · elegí una sección"),
        "",
      ].join("\n")
    );
  }
}

async function runTools(
  args,
  {
    json = false,
    noBanner = false,
    noInteractive = false,
    listOnly = false,
    yes = false,
  } = {}
) {
  const name = args.find((a) => !a.startsWith("-"));
  let section = null;

  if (name) {
    section = findToolSection(name);
    if (!section) {
      unknownSectionError(name);
      return;
    }
  }

  // Non-TTY / --json / --list: never run installs; only list catalog.
  if (json || listOnly || noInteractive) {
    printTools({ json, noBanner, section });
    return;
  }

  if (!input.isTTY || !output.isTTY) {
    printTools({ json: false, noBanner, section });
    return;
  }

  await runToolsInteractive({ noBanner, section, yes, noInteractive });
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
  const noInteractive = flags.has("--no-interactive");
  const yes = flags.has("--yes") || flags.has("-y");
  const [cmd, ...rest] = positionals;

  // Explicit update: foreground install (skips silent auto-update).
  if (cmd === "update") {
    await runUpdateCommand({ noInteractive, argv });
    return;
  }

  // Silent auto-update: short network check (cached ~1h); never waits for npm.
  // Skipped for --no-update / ALQUIMIA_NO_UPDATE / CI / non-TTY.
  if (
    !isAutoUpdateDisabled({
      argv,
      env: process.env,
      stdoutIsTTY: Boolean(process.stdout.isTTY),
    })
  ) {
    try {
      await maybeAutoUpdate();
    } catch {
      // Never block the user's command on update failures.
    }
  }

  if (flags.has("-h") || flags.has("--help")) {
    console.log(helpText({ noBanner }));
    return;
  }

  if (flags.has("-v") || flags.has("--version")) {
    console.log(getVersion());
    return;
  }

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
    await runJoin(rest, { json, noBanner, noInteractive });
    return;
  }

  if (cmd === "events") {
    await runEvents({
      json,
      noBanner,
      noInteractive:
        noInteractive || flags.has("--list") || rest.includes("--list"),
      listOnly: flags.has("--list") || rest.includes("--list"),
      openOnly: flags.has("--open") || rest.includes("--open"),
    });
    return;
  }

  if (cmd === "tools") {
    await runTools(rest, {
      json,
      noBanner,
      yes: yes || rest.includes("--yes") || rest.includes("-y"),
      noInteractive:
        noInteractive || flags.has("--list") || rest.includes("--list"),
      listOnly: flags.has("--list") || rest.includes("--list"),
    });
    return;
  }

  if (cmd === "art") {
    const artOpts = parseArtCliArgs(argv);
    if (artOpts.errors.length) {
      for (const err of artOpts.errors) {
        console.error(style.red(err));
      }
      process.exitCode = 1;
      return;
    }
    await runArt(artOpts);
    return;
  }


  if (cmd === "dino") {
    if (noInteractive || !input.isTTY || !output.isTTY) {
      console.error(
        style.red("El Alquimia Runner necesita una terminal interactiva (TTY).")
      );
      console.error(style.dim("Probá sin --no-interactive en una terminal real."));
      process.exitCode = 1;
      return;
    }
    const result = await playDino({ mode: "standalone" });
    if (result.status === "skipped") {
      console.error(style.red("No pude iniciar el runner en esta terminal."));
      process.exitCode = 1;
      return;
    }
    if (result.status === "over" || result.status === "stopped") {
      console.log(
        style.dim(`Score final: ${result.score}`)
      );
    }
    return;
  }

  if (cmd === "doctor") {
    runDoctor({ json });
    return;
  }

  if (cmd === "completion") {
    runCompletion(rest);
    return;
  }

  const suggestion = closest(cmd, commandNames);
  console.error(style.red(`Comando desconocido: ${cmd}`));
  if (suggestion) {
    console.error(style.yellow(`¿Quisiste decir "${suggestion}"?`));
  }
  console.error(style.dim("Probá: alquimia --help"));
  process.exitCode = 1;
}
