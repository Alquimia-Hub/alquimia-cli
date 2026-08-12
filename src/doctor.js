import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GHOSTTY_BLOCK_BEGIN,
  detectTerminal,
  ghosttyConfigCandidates,
  loadArtPrefs,
  resolveGhosttyConfigPath,
  SUPPORTED_TERMINALS,
} from "./art.js";
import { style } from "./style.js";
import {
  defaultCachePath,
  isAutoUpdateDisabled,
  readCache,
} from "./update.js";
import { getVersion } from "./version.js";

const SUPPORTED_IDS = new Set(SUPPORTED_TERMINALS.map((t) => t.id));

const TERMINAL_LABELS = {
  iterm2: "iTerm2",
  kitty: "Kitty",
  ghostty: "Ghostty",
  wezterm: "WezTerm",
  contour: "Contour",
  tilix: "Tilix",
  terminology: "Terminology",
  hyper: "Hyper",
  tabby: "Tabby",
  "windows-terminal": "Windows Terminal",
  "apple-terminal": "Terminal.app (Apple)",
  alacritty: "Alacritty",
  konsole: "Konsole",
  vscode: "VS Code / Cursor",
  "gnome-terminal": "GNOME Terminal / Ptyxis",
  unsupported: "desconocida / sin soporte",
};

/**
 * Soft-scan common install locations for duplicate alquimia binaries.
 * @param {{
 *   home?: string,
 *   env?: NodeJS.ProcessEnv,
 *   existsSync?: (p: string) => boolean,
 *   argv1?: string,
 * }} [opts]
 * @returns {string[]}
 */
export function findDuplicateInstallHints(opts = {}) {
  const home = opts.home ?? homedir();
  const env = opts.env ?? process.env;
  const exists = opts.existsSync ?? existsSync;
  const nvmDir = env.NVM_DIR || join(home, ".nvm");
  const candidates = [
    "/opt/homebrew/bin/alquimia",
    "/usr/local/bin/alquimia",
    join(home, ".local", "bin", "alquimia"),
    join(nvmDir, "current", "bin", "alquimia"),
  ];

  // Soft: also peek at a few recent nvm node bins if present.
  try {
    const versionsRoot = join(nvmDir, "versions", "node");
    if (exists(versionsRoot)) {
      // Don't readdir aggressively — just common symlink target.
      candidates.push(join(versionsRoot, "node", "bin", "alquimia"));
    }
  } catch {
    /* ignore */
  }

  const found = [];
  for (const p of candidates) {
    if (exists(p) && !found.includes(p)) found.push(p);
  }

  const argv1 = opts.argv1 ?? process.argv[1];
  if (argv1 && exists(argv1) && !found.includes(argv1)) {
    found.unshift(argv1);
  }

  return found;
}

/**
 * Human label for TERM_PROGRAM / detected id.
 * @param {string} terminalId
 * @param {NodeJS.ProcessEnv} [env]
 */
export function describeTerminal(terminalId, env = process.env) {
  const termProgram = env.TERM_PROGRAM || "";
  const label = TERMINAL_LABELS[terminalId] || terminalId;
  const artSupported = SUPPORTED_IDS.has(terminalId);
  return {
    id: terminalId,
    label,
    termProgram: termProgram || null,
    artSupported,
  };
}

/**
 * @param {{
 *   home?: string,
 *   env?: NodeJS.ProcessEnv,
 *   existsSync?: (p: string) => boolean,
 *   readFileSync?: typeof readFileSync,
 * }} [opts]
 */
export function inspectGhosttyManagedBlock(opts = {}) {
  const exists = opts.existsSync ?? existsSync;
  const read = opts.readFileSync ?? readFileSync;
  const candidates = ghosttyConfigCandidates(opts);
  const configPath = resolveGhosttyConfigPath(opts);
  let present = false;
  let readable = true;
  let error = null;

  if (!exists(configPath)) {
    return {
      configPath,
      candidates,
      exists: false,
      managedBlock: false,
      readable: true,
      error: null,
    };
  }

  try {
    const text = read(configPath, "utf8");
    present = text.includes(GHOSTTY_BLOCK_BEGIN);
  } catch (err) {
    readable = false;
    error = err instanceof Error ? err.message : String(err);
  }

  return {
    configPath,
    candidates,
    exists: true,
    managedBlock: present,
    readable,
    error,
  };
}

/**
 * Build the diagnostic report (pure-ish; injectables for tests).
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   argv?: string[],
 *   argv1?: string,
 *   home?: string,
 *   stdoutIsTTY?: boolean,
 *   nodeVersion?: string,
 *   version?: string,
 *   now?: number,
 *   existsSync?: (p: string) => boolean,
 *   readFileSync?: typeof readFileSync,
 * }} [opts]
 */
export function collectDoctorReport(opts = {}) {
  const env = opts.env ?? process.env;
  const argv = opts.argv ?? process.argv.slice(2);
  const home = opts.home ?? homedir();
  const stdoutIsTTY =
    opts.stdoutIsTTY ?? Boolean(process.stdout?.isTTY);
  const version = opts.version ?? getVersion();
  const nodeVersion = opts.nodeVersion ?? process.version;
  const argv1 = opts.argv1 ?? process.argv[1] ?? null;

  const terminalId = detectTerminal(env);
  const terminal = describeTerminal(terminalId, env);
  const prefs = loadArtPrefs({
    home,
    existsSync: opts.existsSync,
    readFileSync: opts.readFileSync,
  });
  const ghostty = inspectGhosttyManagedBlock({
    home,
    env,
    existsSync: opts.existsSync,
    readFileSync: opts.readFileSync,
  });
  const installs = findDuplicateInstallHints({
    home,
    env,
    existsSync: opts.existsSync,
    argv1,
  });

  const noUpdateFlag = argv.includes("--no-update");
  const noUpdateEnv =
    env.ALQUIMIA_NO_UPDATE === "1" || env.ALQUIMIA_NO_UPDATE === "true";
  const ci = env.CI === "true" || env.CI === "1";
  const disabled = isAutoUpdateDisabled({
    argv,
    env,
    stdoutIsTTY,
  });

  const cachePath = defaultCachePath(home);
  const cache = readCache(cachePath);
  let lastUpdateHint = null;
  if (cache?.updateStartedAt && Number.isFinite(cache.updateStartedAt)) {
    lastUpdateHint = {
      at: new Date(cache.updateStartedAt).toISOString(),
      remoteVersion: cache.remoteVersion ?? null,
      source: cache.source ?? null,
    };
  } else if (cache?.checkedAt && Number.isFinite(cache.checkedAt)) {
    lastUpdateHint = {
      checkedAt: new Date(cache.checkedAt).toISOString(),
      remoteVersion: cache.remoteVersion ?? null,
    };
  }

  /** Hard failure only when a required read blows up. */
  const hardErrors = [];
  if (ghostty.exists && !ghostty.readable && ghostty.error) {
    hardErrors.push(`No pude leer Ghostty config: ${ghostty.error}`);
  }

  return {
    ok: hardErrors.length === 0,
    hardErrors,
    node: { version: nodeVersion },
    alquimia: {
      version,
      binaryPath: argv1,
    },
    installs: {
      paths: installs,
      duplicateHint: installs.length > 1,
      homebrew:
        installs.some((p) => p.includes("/opt/homebrew/") || p.includes("/usr/local/bin/")),
      nvm: installs.some((p) => p.includes("/.nvm/") || p.includes("versions/node")),
    },
    terminal,
    artPrefs: {
      path: prefs.path,
      opacity: prefs.opacity,
      fit: prefs.fit,
      fromDisk: prefs.fromDisk,
    },
    ghostty: {
      configPath: ghostty.configPath,
      exists: ghostty.exists,
      managedBlock: ghostty.managedBlock,
      readable: ghostty.readable,
    },
    autoUpdate: {
      disabled,
      reasons: {
        flagNoUpdate: noUpdateFlag,
        envNoUpdate: noUpdateEnv,
        envValue: env.ALQUIMIA_NO_UPDATE ?? null,
        ci,
        nonTty: !stdoutIsTTY,
      },
      cachePath,
      lastUpdateHint,
    },
  };
}

function mark(ok, warn = false) {
  if (ok) return style.green("✓");
  if (warn) return style.yellow("⚠");
  return style.red("✗");
}

/**
 * Format human report lines.
 * @param {ReturnType<typeof collectDoctorReport>} report
 * @returns {string[]}
 */
export function formatDoctorReport(report) {
  const lines = [];
  lines.push(style.bold("Alquimia doctor"));
  lines.push(style.dim("Diagnóstico de entorno · sin side-effects"));
  lines.push("");

  lines.push(
    `${mark(true)} Node.js ${report.node.version}`
  );
  lines.push(
    `${mark(Boolean(report.alquimia.version))} alquimia ${report.alquimia.version}`
  );
  lines.push(
    `${mark(Boolean(report.alquimia.binaryPath))} Binario: ${
      report.alquimia.binaryPath || style.dim("(desconocido)")
    }`
  );

  if (report.installs.duplicateHint) {
    lines.push(
      `${mark(false, true)} Posibles installs duplicados (${report.installs.paths.length}):`
    );
    for (const p of report.installs.paths) {
      lines.push(`    ${style.dim(p)}`);
    }
    if (report.installs.homebrew && report.installs.nvm) {
      lines.push(
        style.dim(
          "    Tip: aparecen paths tipo Homebrew y nvm — revisá cuál está primero en PATH."
        )
      );
    }
  } else if (report.installs.paths.length === 1) {
    lines.push(
      `${mark(true)} Un solo path conocido de install (soft-check)`
    );
  } else {
    lines.push(
      `${mark(true, true)} Soft-check de installs: sin paths extra en ubicaciones comunes`
    );
  }

  lines.push("");
  const term = report.terminal;
  const termLabel = term.termProgram
    ? `${term.label} (TERM_PROGRAM=${term.termProgram})`
    : term.label;
  if (term.artSupported) {
    lines.push(`${mark(true)} Terminal: ${termLabel} · art soportado`);
  } else {
    lines.push(
      `${mark(false, true)} Terminal: ${termLabel} · art no soportado acá`
    );
  }

  const prefs = report.artPrefs;
  lines.push(
    `${mark(true)} Art prefs: ${prefs.path}`
  );
  lines.push(
    `    opacity=${prefs.opacity}  fit=${prefs.fit}${
      prefs.fromDisk ? "" : style.dim("  (defaults; sin archivo)")
    }`
  );

  const g = report.ghostty;
  if (!g.exists) {
    lines.push(
      `${mark(true, true)} Ghostty config: ${g.configPath} ${style.dim("(no existe aún)")}`
    );
  } else if (!g.readable) {
    lines.push(
      `${mark(false)} Ghostty config: no pude leer ${g.configPath}`
    );
  } else if (g.managedBlock) {
    lines.push(
      `${mark(true)} Ghostty config: bloque ${style.cyan("# BEGIN alquimia-art")} presente`
    );
    lines.push(`    ${style.dim(g.configPath)}`);
  } else {
    lines.push(
      `${mark(true, true)} Ghostty config: sin bloque alquimia-art`
    );
    lines.push(`    ${style.dim(g.configPath)}`);
  }

  lines.push("");
  const au = report.autoUpdate;
  if (au.disabled) {
    const why = [];
    if (au.reasons.flagNoUpdate) why.push("--no-update");
    if (au.reasons.envNoUpdate) {
      why.push(`ALQUIMIA_NO_UPDATE=${au.reasons.envValue}`);
    }
    if (au.reasons.ci) why.push("CI");
    if (au.reasons.nonTty) why.push("sin TTY");
    lines.push(
      `${mark(true, true)} Auto-update: desactivado (${why.join(", ") || "sí"})`
    );
  } else {
    lines.push(`${mark(true)} Auto-update: habilitado (check ~1h en TTY)`);
  }
  lines.push(`    cache: ${style.dim(au.cachePath)}`);
  if (au.lastUpdateHint?.at) {
    lines.push(
      `    último update hint: ${au.lastUpdateHint.at}${
        au.lastUpdateHint.remoteVersion
          ? ` → ${au.lastUpdateHint.remoteVersion}`
          : ""
      }`
    );
  } else if (au.lastUpdateHint?.checkedAt) {
    lines.push(
      `    último check: ${au.lastUpdateHint.checkedAt}${
        au.lastUpdateHint.remoteVersion
          ? ` (remote ${au.lastUpdateHint.remoteVersion})`
          : ""
      }`
    );
  } else {
    lines.push(style.dim("    sin cache de update todavía"));
  }

  if (report.hardErrors.length) {
    lines.push("");
    for (const err of report.hardErrors) {
      lines.push(`${mark(false)} ${err}`);
    }
  }

  lines.push("");
  return lines;
}

/**
 * @param {{ json?: boolean, noBanner?: boolean }} [opts]
 * @param {Parameters<typeof collectDoctorReport>[0]} [collectOpts]
 */
export function runDoctor(
  { json = false } = {},
  collectOpts = {}
) {
  const report = collectDoctorReport(collectOpts);

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatDoctorReport(report).join("\n"));
  }

  if (!report.ok) {
    process.exitCode = 1;
  }
  // Exit 0 always unless hard failure reading files.
  return report;
}

/** Package-relative path helper (tests / docs). */
export function packageRoot() {
  return join(dirname(fileURLToPath(import.meta.url)), "..");
}
