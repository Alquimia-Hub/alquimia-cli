import {
  existsSync as fsExistsSync,
  mkdirSync as fsMkdirSync,
  readFileSync as fsReadFileSync,
  writeFileSync as fsWriteFileSync,
} from "node:fs";
import { spawnSync as fsSpawnSync } from "node:child_process";
import { homedir, platform as osPlatform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Settings set name we create / switch to. */
export const ALQUIMIA_TERMINAL_PROFILE = "Alquimia";

/** State filename under ~/.local/share/alquimia/ */
export const APPLE_TERMINAL_STATE_FILENAME = "apple-terminal-state.json";

/**
 * @param {{ home?: string }} [opts]
 * @returns {string}
 */
export function appleTerminalShareDir({ home = homedir() } = {}) {
  return join(home, ".local", "share", "alquimia");
}

/**
 * @param {{ home?: string }} [opts]
 * @returns {string}
 */
export function appleTerminalStatePath(opts = {}) {
  return join(appleTerminalShareDir(opts), APPLE_TERMINAL_STATE_FILENAME);
}

/**
 * @param {{ home?: string }} [opts]
 * @returns {string}
 */
export function appleTerminalProfileFilePath(opts = {}) {
  return join(appleTerminalShareDir(opts), "Alquimia.terminal");
}

/**
 * @param {{
 *   home?: string,
 *   existsSync?: typeof fsExistsSync,
 *   readFileSync?: typeof fsReadFileSync,
 * }} [opts]
 * @returns {{ priorProfile?: string, artPath?: string, active?: boolean } | null}
 */
export function readAppleTerminalState(opts = {}) {
  const exists = opts.existsSync ?? fsExistsSync;
  const read = opts.readFileSync ?? fsReadFileSync;
  const path = appleTerminalStatePath(opts);
  if (!exists(path)) return null;
  try {
    const raw = JSON.parse(read(path, "utf8"));
    if (!raw || typeof raw !== "object") return null;
    return raw;
  } catch {
    return null;
  }
}

/**
 * @param {{ priorProfile?: string, artPath?: string, active?: boolean }} state
 * @param {{
 *   home?: string,
 *   mkdirSync?: typeof fsMkdirSync,
 *   writeFileSync?: typeof fsWriteFileSync,
 * }} [opts]
 */
export function writeAppleTerminalState(state, opts = {}) {
  const mkdir = opts.mkdirSync ?? fsMkdirSync;
  const write = opts.writeFileSync ?? fsWriteFileSync;
  const dir = appleTerminalShareDir(opts);
  mkdir(dir, { recursive: true });
  write(
    appleTerminalStatePath(opts),
    `${JSON.stringify(state, null, 2)}\n`,
    "utf8"
  );
}

/**
 * Honest fallback when profile/bookmark automation fails.
 * @param {string} artPath
 * @returns {string}
 */
export function appleTerminalManualTip(artPath) {
  return [
    "Terminal.app no tiene OSC de fondo; el soporte es por perfil.",
    "Pasos manuales:",
    `  1) alquimia art --open  (o abrí ${artPath})`,
    "  2) Terminal → Ajustes → Perfiles → creá/elegí «Alquimia» → Fondo → elegí ese PNG",
    "  3) volvé a correr alquimia art (solo cambia al perfil Alquimia)",
    "La 1ª vez AppleScript puede pedir Automatización/Accesibilidad.",
  ].join("\n");
}

/**
 * Resolve bundled Swift helper path.
 * @param {{ scriptPath?: string }} [opts]
 * @returns {string}
 */
export function appleTerminalSwiftScriptPath(opts = {}) {
  if (opts.scriptPath) return opts.scriptPath;
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "scripts", "apple-terminal-profile.swift");
}

/**
 * @param {{ spawnSync?: typeof fsSpawnSync }} [opts]
 * @returns {{ ok: boolean, name?: string, error?: string }}
 */
export function getAppleTerminalFrontProfile(opts = {}) {
  const run = opts.spawnSync ?? fsSpawnSync;
  const script =
    'tell application "Terminal" to return name of current settings of selected tab of front window';
  const result = runOsascript(script, run);
  if (!result.ok) return { ok: false, error: result.error };
  const name = String(result.stdout || "").trim();
  if (!name) return { ok: false, error: "perfil vacío" };
  return { ok: true, name };
}

/**
 * @param {string} profileName
 * @param {{ spawnSync?: typeof fsSpawnSync }} [opts]
 * @returns {{ ok: boolean, exists?: boolean, error?: string }}
 */
export function appleTerminalProfileExists(profileName, opts = {}) {
  const run = opts.spawnSync ?? fsSpawnSync;
  const escaped = escapeAppleScriptString(profileName);
  const script = [
    'tell application "Terminal"',
    "  try",
    `    get settings set "${escaped}"`,
    '    return "yes"',
    "  on error",
    '    return "no"',
    "  end try",
    "end tell",
  ].join("\n");
  const result = runOsascript(script, run);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, exists: String(result.stdout || "").trim() === "yes" };
}

/**
 * @param {string} profileName
 * @param {{ spawnSync?: typeof fsSpawnSync }} [opts]
 * @returns {{ ok: boolean, error?: string }}
 */
export function switchAppleTerminalProfile(profileName, opts = {}) {
  const run = opts.spawnSync ?? fsSpawnSync;
  const escaped = escapeAppleScriptString(profileName);
  const script = [
    'tell application "Terminal"',
    `  set current settings of selected tab of front window to settings set "${escaped}"`,
    "end tell",
  ].join("\n");
  return runOsascript(script, run);
}

/**
 * Create/update Alquimia profile bookmark via Swift helper (macOS only).
 * @param {string} artPath
 * @param {object} [opts]
 * @returns {{ ok: boolean, terminalFile?: string, wrotePrefs?: boolean, error?: string }}
 */
export function ensureAppleTerminalProfile(artPath, opts = {}) {
  const run = opts.spawnSync ?? fsSpawnSync;
  const profileName = opts.profileName ?? ALQUIMIA_TERMINAL_PROFILE;
  const terminalFile =
    opts.terminalFile ?? appleTerminalProfileFilePath(opts);
  const scriptPath = appleTerminalSwiftScriptPath(opts);
  const swiftBin = opts.swiftBin ?? "/usr/bin/swift";

  const result = run(swiftBin, [scriptPath, artPath, profileName, terminalFile], {
    encoding: "utf8",
    timeout: 20000,
  });

  if (result.error && result.error.code === "ENOENT") {
    return {
      ok: false,
      error: "No encuentro /usr/bin/swift para crear el bookmark del perfil.",
    };
  }

  const stdout = String(result.stdout || "").trim();
  let parsed = null;
  try {
    parsed = stdout ? JSON.parse(stdout) : null;
  } catch {
    parsed = null;
  }

  if (result.status !== 0 || !parsed?.ok) {
    return {
      ok: false,
      error:
        parsed?.error ||
        String(result.stderr || "").trim() ||
        `swift helper exit ${result.status}`,
      terminalFile: parsed?.terminalFile,
      wrotePrefs: Boolean(parsed?.wrotePrefs),
    };
  }

  return {
    ok: true,
    terminalFile: parsed.terminalFile || terminalFile,
    wrotePrefs: Boolean(parsed.wrotePrefs),
  };
}

/**
 * Import a .terminal profile into the running Terminal.app.
 * @param {string} terminalFile
 * @param {{ spawnSync?: typeof fsSpawnSync }} [opts]
 * @returns {{ ok: boolean, error?: string }}
 */
export function importAppleTerminalProfileFile(terminalFile, opts = {}) {
  const run = opts.spawnSync ?? fsSpawnSync;
  const result = run("open", ["-a", "Terminal", terminalFile], {
    encoding: "utf8",
    timeout: 10000,
  });
  if (result.error && result.error.code === "ENOENT") {
    return { ok: false, error: "open no encontrado" };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      error:
        String(result.stderr || "").trim() ||
        "No pude importar el perfil .terminal",
    };
  }
  return { ok: true };
}

/**
 * Apply brand art on Apple Terminal.app via Alquimia profile + AppleScript switch.
 * @param {string} artPath
 * @param {object} [opts]
 */
export function setAppleTerminalBackground(artPath, opts = {}) {
  const plat = opts.platform ?? osPlatform();
  if (plat !== "darwin") {
    return {
      ok: false,
      error: "Terminal.app solo está en macOS.",
      tip: appleTerminalManualTip(artPath),
    };
  }

  const profileName = opts.profileName ?? ALQUIMIA_TERMINAL_PROFILE;
  const getFront = opts.getFrontProfile ?? getAppleTerminalFrontProfile;
  const existsFn = opts.profileExists ?? appleTerminalProfileExists;
  const ensureFn = opts.ensureProfile ?? ensureAppleTerminalProfile;
  const importFn = opts.importProfile ?? importAppleTerminalProfileFile;
  const switchFn = opts.switchProfile ?? switchAppleTerminalProfile;
  const sleepFn = opts.sleepMs ?? sleepMs;

  const front = getFront(opts);
  const priorFromFront =
    front.ok && front.name && front.name !== profileName ? front.name : null;

  const ensured = ensureFn(artPath, opts);
  if (!ensured.ok) {
    return {
      ok: false,
      error: ensured.error || "No pude crear el perfil Alquimia.",
      tip: appleTerminalManualTip(artPath),
    };
  }

  let exists = existsFn(profileName, opts);
  if (!exists.ok || !exists.exists) {
    if (ensured.terminalFile) {
      const imported = importFn(ensured.terminalFile, opts);
      if (!imported.ok) {
        return {
          ok: false,
          error: imported.error || "No pude importar Alquimia.terminal",
          tip: appleTerminalManualTip(artPath),
        };
      }
      sleepFn(400);
      exists = existsFn(profileName, opts);
    }
  }

  let switched = switchFn(profileName, opts);
  if (!switched.ok && ensured.terminalFile) {
    // Profile may exist in prefs but not in Terminal's live list — import once.
    importFn(ensured.terminalFile, opts);
    sleepFn(400);
    switched = switchFn(profileName, opts);
  }

  if (!switched.ok) {
    return {
      ok: false,
      error:
        switched.error ||
        "No pude cambiar al perfil Alquimia (¿permiso de Automatización?).",
      tip: appleTerminalManualTip(artPath),
      profile: profileName,
    };
  }

  const prevState = readAppleTerminalState(opts);
  const priorProfile =
    priorFromFront || prevState?.priorProfile || "Basic";
  writeAppleTerminalState(
    {
      priorProfile,
      artPath,
      active: true,
      profile: profileName,
    },
    opts
  );

  return {
    ok: true,
    profile: profileName,
    priorProfile,
    artPath,
    successMessage: "Fondo aplicado (perfil Terminal «Alquimia»)",
    tip: "Soporte por perfil (no OSC). Puede pedir Automatización/Accesibilidad la 1ª vez.",
  };
}

/**
 * Switch front tab back to the remembered prior profile.
 * @param {object} [opts]
 */
export function clearAppleTerminalBackground(opts = {}) {
  const plat = opts.platform ?? osPlatform();
  if (plat !== "darwin") {
    return {
      ok: false,
      error: "Terminal.app solo está en macOS.",
    };
  }

  const profileName = opts.profileName ?? ALQUIMIA_TERMINAL_PROFILE;
  const getFront = opts.getFrontProfile ?? getAppleTerminalFrontProfile;
  const switchFn = opts.switchProfile ?? switchAppleTerminalProfile;

  const state = readAppleTerminalState(opts);
  const prior = state?.priorProfile || "Basic";
  const front = getFront(opts);

  // Already not on Alquimia — treat as cleared.
  if (front.ok && front.name && front.name !== profileName) {
    writeAppleTerminalState(
      {
        priorProfile: prior,
        artPath: state?.artPath,
        active: false,
        profile: profileName,
      },
      opts
    );
    return {
      ok: true,
      changed: false,
      priorProfile: prior,
      successMessage: `Ya no estabas en «${profileName}» (perfil actual: ${front.name}).`,
    };
  }

  const switched = switchFn(prior, opts);
  if (!switched.ok) {
    return {
      ok: false,
      changed: false,
      error:
        switched.error ||
        `No pude volver al perfil «${prior}». Elegilo a mano en Terminal → Ajustes.`,
    };
  }

  writeAppleTerminalState(
    {
      priorProfile: prior,
      artPath: state?.artPath,
      active: false,
      profile: profileName,
    },
    opts
  );

  return {
    ok: true,
    changed: true,
    priorProfile: prior,
    successMessage: `Fondo sacado (volví al perfil «${prior}»)`,
  };
}

/**
 * @param {string} script
 * @param {typeof fsSpawnSync} run
 */
function runOsascript(script, run) {
  try {
    const result = run("osascript", ["-e", script], {
      encoding: "utf8",
      timeout: 10000,
    });
    if (result.error && result.error.code === "ENOENT") {
      return { ok: false, error: "osascript no encontrado" };
    }
    if (result.status !== 0) {
      return {
        ok: false,
        error:
          String(result.stderr || "").trim() ||
          "osascript falló (¿Automatización/Accesibilidad para Terminal?)",
        stdout: String(result.stdout || ""),
      };
    }
    return { ok: true, stdout: String(result.stdout || "") };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function escapeAppleScriptString(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function sleepMs(ms) {
  const n = Number(ms) || 0;
  if (n <= 0) return;
  try {
    fsSpawnSync("sleep", [String(n / 1000)], { timeout: n + 1000 });
  } catch {
    /* ignore */
  }
}
