import { spawn, type StdioOptions } from "node:child_process";
import { stdin as input, stdout as output } from "node:process";

import { parseArtCliArgs, runArt } from "./art.ts";
import { commandNames } from "./commands.ts";
import {
  community,
  getNextCommunityCall,
  joinOptions,
  linkAliases,
  linkLabels,
  linkOrder,
  resolveEventUrl,
  resolveLinkKey,
} from "./community.ts";
import { runCompletion } from "./completion.ts";
import { runDoctor } from "./doctor.ts";
import { openUrl } from "./open-url.ts";
import { closest } from "./suggest.ts";
import {
  findToolSection,
  isToolOpenable,
  normalizeInstall,
  toolHasInstall,
  toolSections,
  toolsCatalogPayload,
} from "./tools.ts";
import {
  isAutoUpdateDisabled,
  maybeAutoUpdate,
  runUpdateCommand,
} from "./update.ts";
import { getVersion } from "./version.ts";
import type { CommunityEvent, LinkKey, Tool, ToolSection } from "./types.ts";

import { isInteractive, printDoc, runApp } from "./ui/app.ts";
import { playDino, runWithDino } from "./ui/dino.ts";
import { HINT_FILTER, HINT_SIMPLE, promptConfirm, promptSelect } from "./ui/picker.ts";
import { emit, emitErr, flushReport } from "./ui/report.ts";
import { style, t } from "./ui/style.ts";
import {
  eventOptions,
  eventsView,
  formatEventWhen,
  helpView,
  homeOptions,
  infoView,
  joinOptionsForPicker,
  joinView,
  sectionOptions,
  toolOptions,
  toolsView,
} from "./ui/views.ts";

/* ── Shared helpers ─────────────────────────────────────────────────── */

/** Machine-readable output always goes to raw stdout. */
function printJson(payload: unknown): void {
  console.log(JSON.stringify(payload, null, 2));
}

async function openNetwork(key: LinkKey): Promise<void> {
  const url = community.links[key];
  const label = linkLabels[key];

  try {
    await openUrl(url);
    emit(t`${style.green("✓")} Abriendo ${style.bold(label)}…`);
    emit(t`  ${style.faint(url)}`);
  } catch (err) {
    emitErr(`No pude abrir el navegador: ${(err as Error).message}`);
    emitErr(`URL: ${url}`);
    process.exitCode = 1;
  }
  await flushReport();
}

function unknownNetworkError(name: string): void {
  const suggestion = closest(name, [...linkOrder, ...Object.keys(linkAliases)]);
  emitErr(`No conozco la red "${name}".`);
  if (suggestion) {
    emitErr(`¿Quisiste decir "${suggestion}"?`);
  } else {
    emitErr(`Opciones: ${linkOrder.join(", ")} (alias: site, x, gh, wa)`);
  }
  process.exitCode = 1;
}

/* ── open ───────────────────────────────────────────────────────────── */

async function runOpen(args: string[]): Promise<void> {
  const name = args.find((a) => !a.startsWith("-"));

  if (!name) {
    emitErr("Falta la red a abrir.");
    emitErr("Uso: alquimia open <red>");
    emitErr(`Redes: ${linkOrder.join(", ")} (alias: site, x, gh, wa)`);
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

/* ── join ───────────────────────────────────────────────────────────── */

async function runJoin(
  args: string[],
  { json = false, noBanner = false, noInteractive = false } = {},
): Promise<void> {
  const name = args.find((a) => !a.startsWith("-"));

  if (name) {
    const key = resolveLinkKey(name);
    if (!key) {
      unknownNetworkError(name);
      return;
    }
    await openNetwork(key);
    return;
  }

  if (json) {
    printJson({
      default: "discord",
      options: joinOptions.map((opt) => ({
        key: opt.key,
        label: linkLabels[opt.key],
        blurb: opt.blurb,
        url: community.links[opt.key],
      })),
      links: community.links,
    });
    return;
  }

  if (noInteractive || !isInteractive()) {
    await printDoc(joinView({ noBanner }));
    return;
  }

  const picked = await runApp<LinkKey>(async ({ renderer, exit }) => {
    const choice = await promptSelect(renderer, {
      title: "¿Por dónde te sumás?",
      subtitle: "Discord es lo más completo (calls + canales).",
      options: joinOptionsForPicker(),
      hint: HINT_SIMPLE,
    });
    exit(choice?.option.value ?? null);
  });

  if (!picked) return;
  await openNetwork(picked);
}

/* ── events ─────────────────────────────────────────────────────────── */

async function openEventUrl(event: CommunityEvent): Promise<void> {
  const url = resolveEventUrl(event);
  const label = event?.name ? `${event.name} (${formatEventWhen(event)})` : "Discord";

  try {
    await openUrl(url);
    emit(t`${style.green("✓")} Abriendo ${style.bold(label)}…`);
    emit(t`  ${style.faint(url)}`);
  } catch (err) {
    emitErr(`No pude abrir el navegador: ${(err as Error).message}`);
    emitErr(`URL: ${url}`);
    process.exitCode = 1;
  }
  await flushReport();
}

async function runEvents({
  json = false,
  noBanner = false,
  noInteractive = false,
  listOnly = false,
  openOnly = false,
} = {}) {
  const next = getNextCommunityCall();

  if (json) {
    printJson({
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
    });
    return;
  }

  if (openOnly) {
    const target = next?.event ?? community.events[0];
    if (!target) {
      emitErr("No hay events configurados.");
      process.exitCode = 1;
      return;
    }
    await openEventUrl(target);
    return;
  }

  if (listOnly || noInteractive || !isInteractive()) {
    await printDoc(eventsView({ noBanner, next }));
    return;
  }

  const events = community.events ?? [];
  if (events.length === 0) {
    await printDoc(eventsView({ noBanner, next }));
    return;
  }

  const initialIndex = next
    ? Math.max(0, events.findIndex((e) => e.id === next.event.id))
    : 0;

  const picked = await runApp<CommunityEvent>(async ({ renderer, exit }) => {
    const choice = await promptSelect(renderer, {
      title: "Community calls",
      subtitle: "Recurrentes · voz en Discord · horario ARG (UTC-3)",
      options: eventOptions(next),
      initialIndex,
      hint: "↑↓ elegí · Enter abre el evento en Discord · q salí",
    });
    exit(choice?.option.value ?? null);
  });

  if (!picked) return;
  await openEventUrl(picked);
}

/* ── tools ──────────────────────────────────────────────────────────── */

/**
 * Run a static catalog shell command (never remote eval).
 * @param {string} command
 * @param {{ cwd?: string, stdio?: import('node:child_process').StdioOptions }} [opts]
 * @returns {Promise<{ ok: boolean, code: number, stdout?: string, stderr?: string }>}
 */
interface InstallResult {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
}

function runInstallCommand(
  command: string,
  {
    cwd = process.cwd(),
    stdio = "inherit" as StdioOptions,
  }: { cwd?: string; stdio?: StdioOptions } = {},
): Promise<InstallResult> {
  return new Promise<InstallResult>((resolve) => {
    const child = spawn(command, { shell: true, stdio, cwd, env: process.env });

    let capturedOut = "";
    let capturedErr = "";
    if (child.stdout && typeof child.stdout.on === "function") {
      child.stdout.on("data", (buf: unknown) => {
        capturedOut += String(buf);
      });
    }
    if (child.stderr && typeof child.stderr.on === "function") {
      child.stderr.on("data", (buf: unknown) => {
        capturedErr += String(buf);
      });
    }

    child.once("error", (err: Error) => {
      emitErr(`No pude ejecutar el comando: ${(err as Error).message}`);
      resolve({ ok: false, code: 1, stdout: capturedOut, stderr: capturedErr });
    });

    child.once("close", (code: number | null) => {
      const exit = typeof code === "number" ? code : 1;
      resolve({ ok: exit === 0, code: exit, stdout: capturedOut, stderr: capturedErr });
    });
  });
}

/**
 * Confirm and run an install. Runs outside the picker app so the child
 * process gets a clean terminal (or the runner, when one is offered).
 * @returns {Promise<'done'|'back'>}
 */
async function confirmAndRunInstall(
  tool: Tool,
  command: string,
  { yes = false, noInteractive = false } = {},
): Promise<"done" | "back"> {
  if (!yes) {
    const confirmed = await runApp<boolean>(async ({ renderer, exit }) => {
      exit(
        await promptConfirm(renderer, {
          title: `Instalar ${tool.name}`,
          subtitle: `cwd: ${process.cwd()}`,
          detail: command,
        }),
      );
    });

    if (!confirmed) {
      emit(t`${style.muted("Cancelado.")}`);
      await flushReport();
      return "back";
    }
  }

  emit(t`${style.green("→")} Corriendo install de ${style.bold(tool.name)}…`);
  emit(t`  ${style.cyan(command)}`);
  emit("");
  await flushReport();

  const { result, playedDino, dinoScore } = await runWithDino(
    async ({ useDino }) => {
      const stdio: StdioOptions = useDino ? ["ignore", "pipe", "pipe"] : "inherit";
      return runInstallCommand(command, { cwd: process.cwd(), stdio });
    },
    { noInteractive, env: process.env },
  );

  if (playedDino) {
    const combined = `${result.stdout || ""}${result.stderr || ""}`.trim();
    if (combined) emit(combined);
    emit(t`${style.faint(`(Alquimia Runner — score mientras instalabas: ${dinoScore})`)}`);
  }

  if (result.ok) {
    emit("");
    emit(t`${style.green("✓")} Listo — ${style.bold(tool.name)} instalado.`);
    await flushReport();
    return "done";
  }

  await flushReport();
  emitErr(`Falló el install (exit ${result.code}). Revisá el output de arriba.`);
  if (tool.url) emitErr(`Docs: ${tool.url}`);
  process.exitCode = 1;
  return "done";
}

async function openToolUrl(tool: Tool): Promise<boolean> {
  if (!isToolOpenable(tool)) {
    emit(t`${style.yellow("Todavía no cargamos el link — pronto.")}`);
    if (tool?.blurb) emit(t`  ${style.faint(`${tool.name}: ${tool.blurb}`)}`);
    await flushReport();
    return false;
  }

  try {
    await openUrl(tool.url!);
    emit(t`${style.green("✓")} Abriendo ${style.bold(tool.name)}…`);
    emit(t`  ${style.faint(tool.url!)}`);
    await flushReport();
    return true;
  } catch (err) {
    emitErr(`No pude abrir el navegador: ${(err as Error).message}`);
    emitErr(`URL: ${tool.url}`);
    process.exitCode = 1;
    return false;
  }
}

/**
 * Where to install: global vs project.
 * @returns {Promise<'done'|'back'>}
 */
async function pickInstallWhere(
  tool: Tool,
  { yes = false, noInteractive = false } = {},
): Promise<"done" | "back"> {
  const install = normalizeInstall(tool);
  if (!install || (!install.global && !install.project)) {
    emit(t`${style.yellow("Todavía no hay comando de install configurado para esta tool.")}`);
    await flushReport();
    return "back";
  }

  while (true) {
    const choice = await runApp<number>(async ({ renderer, exit }) => {
      const picked = await promptSelect(renderer, {
        title: `Instalar ${tool.name}`,
        subtitle: install.note ?? "Elegí dónde instalar",
        banner: false,
        options: [
          {
            name: "Global",
            description: install.global ?? "no configurado",
          },
          {
            name: "En este proyecto",
            description: install.project ?? "no configurado",
          },
          ...(isToolOpenable(tool)
            ? [{ name: "Abrir docs", description: tool.url ?? "" }]
            : []),
        ],
        hint: HINT_SIMPLE,
      });
      exit(picked?.index ?? -1);
    });

    if (choice == null || choice < 0) return "back";
    if (choice === 2) {
      await openToolUrl(tool);
      return "done";
    }

    const command = choice === 0 ? install.global : install.project;
    if (!command) {
      emit(
        t`${style.yellow(
          choice === 0
            ? "No hay install global para esta tool. Probá «En este proyecto» o abrí las docs."
            : "Install en este proyecto no está disponible para esta tool.",
        )}`,
      );
      await flushReport();
      continue;
    }

    return confirmAndRunInstall(tool, command, { yes, noInteractive });
  }
}

/**
 * Action picker for one tool.
 * @returns {Promise<'done'|'back'>}
 */
async function pickToolAction(
  tool: Tool,
  { yes = false, noInteractive = false } = {},
): Promise<"done" | "back"> {
  const canOpen = isToolOpenable(tool);
  const canInstall = toolHasInstall(tool);

  if (tool.comingSoon || (!canOpen && !canInstall)) {
    emit(
      t`${style.yellow(`${tool.name} todavía no tiene acciones — pronto sumamos link e install.`)}`,
    );
    if (tool.blurb) emit(t`  ${style.faint(tool.blurb)}`);
    await flushReport();
    return "back";
  }

  const actions = [
    ...(canOpen ? [{ id: "open", name: "Abrir repo / docs", description: tool.url ?? "" }] : []),
    ...(canInstall ? [{ id: "install", name: "Instalar", description: "Global o en este proyecto" }] : []),
  ];

  while (true) {
    const chosen = await runApp<{ name: string }>(async ({ renderer, exit }) => {
      const picked = await promptSelect(renderer, {
        title: tool.name,
        subtitle: tool.blurb,
        banner: false,
        options: actions,
        hint: HINT_SIMPLE,
      });
      exit(picked?.option ?? null);
    });

    if (!chosen) return "back";

    const action = actions.find((a) => a.name === chosen.name);
    if (action?.id === "open") {
      await openToolUrl(tool);
      return "done";
    }
    if (action?.id === "install") {
      const result = await pickInstallWhere(tool, { yes, noInteractive });
      if (result === "back") continue;
      return result;
    }
  }
}

/**
 * Tool picker for one section.
 * @returns {Promise<boolean>} true when an action completed
 */
async function pickToolInSection(
  section: ToolSection,
  { yes = false, noInteractive = false } = {},
): Promise<boolean> {
  const tools = section.tools ?? [];
  if (tools.length === 0) {
    emit(t`${style.muted("Esta sección todavía no tiene tools.")}`);
    await flushReport();
    return true;
  }

  while (true) {
    const picked = await runApp<Tool>(async ({ renderer, exit }) => {
      const choice = await promptSelect(renderer, {
        title: section.name,
        subtitle: section.blurb,
        options: toolOptions(section),
        filterable: true,
        hint: HINT_FILTER,
      });
      exit(choice?.option.value ?? null);
    });

    if (!picked) return false;

    const result = await pickToolAction(picked, { yes, noInteractive });
    if (result === "done") return true;
  }
}

async function runToolsInteractive({
  section = null,
  yes = false,
  noInteractive = false,
}: { section?: ToolSection | null; yes?: boolean; noInteractive?: boolean } = {}): Promise<void> {
  if (section) {
    await pickToolInSection(section, { yes, noInteractive });
    return;
  }

  while (true) {
    const picked = await runApp<ToolSection>(async ({ renderer, exit }) => {
      const choice = await promptSelect(renderer, {
        title: "Catálogo de tools",
        subtitle: "Recomendaciones de la comunidad · elegí una sección",
        options: sectionOptions(),
        filterable: true,
        hint: HINT_FILTER,
      });
      exit(choice?.option.value ?? null);
    });

    if (!picked) return;

    const finished = await pickToolInSection(picked, { yes, noInteractive });
    if (finished) return;
  }
}

async function runTools(
  args: string[],
  { json = false, noBanner = false, noInteractive = false, listOnly = false, yes = false } = {},
): Promise<void> {
  const name = args.find((a) => !a.startsWith("-"));
  let section: ToolSection | null = null;

  if (name) {
    section = findToolSection(name);
    if (!section) {
      const ids = toolSections.map((s) => s.id);
      const suggestion = closest(name, ids);
      emitErr(`No conozco la sección "${name}".`);
      emitErr(suggestion ? `¿Quisiste decir "${suggestion}"?` : `Secciones: ${ids.join(", ")}`);
      process.exitCode = 1;
      return;
    }
  }

  if (json) {
    const payload = toolsCatalogPayload();
    if (section) {
      const match = payload.sections.find((s) => s.id === section.id);
      printJson({ section: match ?? null, sections: match ? [match] : [] });
      return;
    }
    printJson(payload);
    return;
  }

  if (listOnly || noInteractive || !isInteractive()) {
    await printDoc(toolsView({ noBanner, section }));
    return;
  }

  await runToolsInteractive({ section, yes, noInteractive });
}

/* ── Home menu ──────────────────────────────────────────────────────── */

/**
 * Interactive launcher shown when `alquimia` runs with no command on a TTY.
 * Resolves to the command the user picked, or `null` to quit.
 */
async function pickHomeCommand(): Promise<string | null> {
  const picked = await runApp<string>(async ({ renderer, exit }) => {
    const choice = await promptSelect(renderer, {
      title: "Alquimia",
      subtitle: community.tagline,
      options: homeOptions(),
      filterable: true,
      hint: HINT_FILTER,
    });
    exit(choice?.option.value ?? null);
  });

  if (!picked || picked === "salir") return null;
  return picked;
}

/* ── Entry point ────────────────────────────────────────────────────── */

function parseArgs(argv: string[]): { flags: Set<string>; positionals: string[] } {
  const flags = new Set<string>();
  const positionals: string[] = [];

  for (const arg of argv) {
    if (arg.startsWith("-")) flags.add(arg);
    else positionals.push(arg);
  }

  return { flags, positionals };
}

export async function run(argv: string[]): Promise<void> {
  const { flags, positionals } = parseArgs(argv);
  const noBanner = flags.has("--no-banner");
  const json = flags.has("--json");
  const noInteractive = flags.has("--no-interactive");
  const yes = flags.has("--yes") || flags.has("-y");
  let [cmd, ...rest] = positionals;

  // Explicit update: foreground install (skips silent auto-update).
  if (cmd === "update") {
    await runUpdateCommand({ noInteractive, argv });
    return;
  }

  // Silent auto-update: short network check (cached ~1h); never waits for npm.
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

  // Order matters: `-v` carries no positional, so the version check has to
  // run before the "no command given" fallback to help.
  if (flags.has("-h") || flags.has("--help")) {
    await printDoc(helpView({ noBanner }));
    return;
  }

  if (flags.has("-v") || flags.has("--version")) {
    console.log(getVersion());
    return;
  }

  if (!cmd) {
    // Bare `alquimia` on a terminal opens the launcher; piped or
    // --no-interactive still prints plain help so scripts keep working.
    if (!noInteractive && isInteractive()) {
      const chosen = await pickHomeCommand();
      if (!chosen) return;
      cmd = chosen;
    } else {
      await printDoc(helpView({ noBanner }));
      return;
    }
  }

  if (cmd === "help") {
    await printDoc(helpView({ noBanner }));
    return;
  }

  if (cmd === "version") {
    console.log(getVersion());
    return;
  }

  if (cmd === "info") {
    if (json) {
      printJson(community);
      return;
    }
    await printDoc(infoView({ noBanner }));
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
    const listOnly = flags.has("--list") || rest.includes("--list");
    await runEvents({
      json,
      noBanner,
      noInteractive: noInteractive || listOnly,
      listOnly,
      openOnly: flags.has("--open") || rest.includes("--open"),
    });
    return;
  }

  if (cmd === "tools") {
    const listOnly = flags.has("--list") || rest.includes("--list");
    await runTools(rest, {
      json,
      noBanner,
      yes: yes || rest.includes("--yes") || rest.includes("-y"),
      noInteractive: noInteractive || listOnly,
      listOnly,
    });
    return;
  }

  if (cmd === "art") {
    const artOpts = parseArtCliArgs(argv);
    if (artOpts.errors.length) {
      for (const err of artOpts.errors) emitErr(err);
      process.exitCode = 1;
      return;
    }
    await runArt(artOpts);
    return;
  }

  if (cmd === "dino") {
    if (noInteractive || !input.isTTY || !output.isTTY) {
      emitErr("El Alquimia Runner necesita una terminal interactiva (TTY).");
      emitErr("Probá sin --no-interactive en una terminal real.");
      process.exitCode = 1;
      return;
    }

    const result = await playDino({ noInteractive });
    if (result.status === "skipped") {
      emitErr("No pude iniciar el runner en esta terminal.");
      process.exitCode = 1;
      return;
    }

    emit(t`${style.faint(`Score final: ${result.score}`)}`);
    await flushReport();
    return;
  }

  if (cmd === "doctor") {
    runDoctor({ json });
    if (!json) await flushReport();
    return;
  }

  if (cmd === "completion") {
    runCompletion(rest);
    return;
  }

  const suggestion = closest(cmd, commandNames);
  emitErr(`Comando desconocido: ${cmd}`);
  if (suggestion) emitErr(`¿Quisiste decir "${suggestion}"?`);
  emitErr("Probá: alquimia --help");
  process.exitCode = 1;
}
