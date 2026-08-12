import { spawn, spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  closeSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { getVersion } from "./version.js";
import { style } from "./style.js";
import { runWithDino } from "./dino/game.js";

/** Skip network if last successful check was within this window. */
export const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/** Don't spawn another background install if one was started recently. */
export const UPDATE_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

export const REMOTE_PACKAGE_URL =
  "https://raw.githubusercontent.com/Alquimia-Hub/alquimia-cli/master/package.json";

export const INSTALL_SPEC = "github:Alquimia-Hub/alquimia-cli";

/** Common Homebrew / Intel Mac npm global roots when `npm root -g` fails. */
export const NPM_GLOBAL_ROOT_FALLBACKS = [
  "/opt/homebrew/lib/node_modules",
  "/usr/local/lib/node_modules",
];

const FETCH_TIMEOUT_MS = 3000;
const NPM_ROOT_TIMEOUT_MS = 5000;

/**
 * Tiny semver compare (major.minor.patch, numeric).
 * Extra pre-release / build suffixes are ignored after the first three parts.
 * @param {string} a
 * @param {string} b
 * @returns {-1|0|1} negative if a < b, 0 if equal, positive if a > b
 */
export function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return 0;
}

/**
 * @param {string} version
 * @returns {[number, number, number]}
 */
function parseSemver(version) {
  const raw = String(version ?? "")
    .trim()
    .replace(/^v/i, "");
  const core = raw.split("-")[0].split("+")[0];
  const parts = core.split(".");
  return [
    Number.parseInt(parts[0], 10) || 0,
    Number.parseInt(parts[1], 10) || 0,
    Number.parseInt(parts[2], 10) || 0,
  ];
}

/** @param {string} remote @param {string} local */
export function isNewer(remote, local) {
  return compareSemver(remote, local) > 0;
}

/**
 * Whether we should hit the network given a cache payload and now.
 * @param {{ checkedAt?: number } | null | undefined} cache
 * @param {number} [now]
 * @param {number} [intervalMs]
 */
export function shouldCheck(cache, now = Date.now(), intervalMs = CHECK_INTERVAL_MS) {
  if (!cache || typeof cache.checkedAt !== "number") return true;
  if (!Number.isFinite(cache.checkedAt)) return true;
  return now - cache.checkedAt >= intervalMs;
}

/**
 * Whether a background update was started recently (avoid re-spawn / re-print).
 * @param {{ updateStartedAt?: number } | null | undefined} cache
 * @param {number} [now]
 * @param {number} [cooldownMs]
 */
export function isUpdateInFlight(
  cache,
  now = Date.now(),
  cooldownMs = UPDATE_COOLDOWN_MS
) {
  if (!cache || typeof cache.updateStartedAt !== "number") return false;
  if (!Number.isFinite(cache.updateStartedAt)) return false;
  return now - cache.updateStartedAt < cooldownMs;
}

export function defaultAlquimiaDir(home = homedir()) {
  return join(home, ".alquimia");
}

export function defaultCachePath(home = homedir()) {
  return join(defaultAlquimiaDir(home), "update-cache.json");
}

export function defaultLogPath(home = homedir()) {
  return join(defaultAlquimiaDir(home), "update.log");
}

/**
 * @param {string} cachePath
 * @returns {object | null}
 */
export function readCache(cachePath) {
  try {
    if (!existsSync(cachePath)) return null;
    const raw = readFileSync(cachePath, "utf8");
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} cachePath
 * @param {object} data
 */
export function writeCache(cachePath, data) {
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

/**
 * @param {{ argv?: string[], env?: NodeJS.ProcessEnv, stdoutIsTTY?: boolean }} [opts]
 */
export function isAutoUpdateDisabled({
  argv = process.argv.slice(2),
  env = process.env,
  stdoutIsTTY = Boolean(process.stdout.isTTY),
} = {}) {
  if (argv.includes("--no-update")) return true;
  if (env.ALQUIMIA_NO_UPDATE === "1" || env.ALQUIMIA_NO_UPDATE === "true") {
    return true;
  }
  if (env.CI === "true" || env.CI === "1") return true;
  if (!stdoutIsTTY) return true;
  return false;
}

/**
 * @param {string} url
 * @param {{ fetchFn?: typeof fetch, timeoutMs?: number }} [opts]
 * @returns {Promise<string | null>}
 */
export async function fetchRemoteVersion(
  url = REMOTE_PACKAGE_URL,
  { fetchFn = globalThis.fetch, timeoutMs = FETCH_TIMEOUT_MS } = {}
) {
  if (typeof fetchFn !== "function") return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchFn(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res || !res.ok) return null;
    const text = await res.text();
    const pkg = JSON.parse(text);
    const version = typeof pkg?.version === "string" ? pkg.version.trim() : "";
    return version || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function npmBinary() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

/**
 * Resolve npm's global node_modules root (`npm root -g`).
 * Falls back to Homebrew /usr/local paths when the command fails.
 *
 * @param {{
 *   spawnSyncFn?: typeof spawnSync,
 *   npmCmd?: string,
 *   fallbacks?: string[],
 *   existsFn?: typeof existsSync,
 *   timeoutMs?: number,
 * }} [opts]
 * @returns {string | null}
 */
export function resolveNpmGlobalRoot({
  spawnSyncFn = spawnSync,
  npmCmd = npmBinary(),
  fallbacks = NPM_GLOBAL_ROOT_FALLBACKS,
  existsFn = existsSync,
  timeoutMs = NPM_ROOT_TIMEOUT_MS,
} = {}) {
  try {
    const result = spawnSyncFn(npmCmd, ["root", "-g"], {
      encoding: "utf8",
      timeout: timeoutMs,
      windowsHide: true,
    });
    if (result && result.status === 0) {
      const root = String(result.stdout ?? "").trim();
      if (root) return root;
    }
  } catch {
    // fall through
  }

  for (const candidate of fallbacks) {
    if (existsFn(candidate)) return candidate;
  }

  return fallbacks[0] ?? null;
}

/**
 * Paths to remove before a global reinstall (avoids Mac ENOTEMPTY on rename).
 * - `<npmRoot>/alquimia`
 * - `<npmRoot>/.alquimia-*` (npm temp leftovers)
 *
 * @param {string} npmRoot
 * @param {{ readdirFn?: typeof readdirSync }} [opts]
 * @returns {string[]}
 */
export function globalAlquimiaCleanupTargets(
  npmRoot,
  { readdirFn = readdirSync } = {}
) {
  if (!npmRoot) return [];
  const targets = [join(npmRoot, "alquimia")];
  try {
    for (const name of readdirFn(npmRoot)) {
      if (typeof name === "string" && name.startsWith(".alquimia-")) {
        targets.push(join(npmRoot, name));
      }
    }
  } catch {
    // ignore unreadable roots
  }
  return targets;
}

/**
 * Best-effort rm of global package + npm temp dirs before `npm install -g`.
 * @param {string | null} npmRoot
 * @param {{
 *   rmFn?: typeof rmSync,
 *   readdirFn?: typeof readdirSync,
 *   existsFn?: typeof existsSync,
 * }} [opts]
 * @returns {string[]} removed paths
 */
export function cleanGlobalAlquimiaInstall(
  npmRoot,
  {
    rmFn = rmSync,
    readdirFn = readdirSync,
    existsFn = existsSync,
  } = {}
) {
  if (!npmRoot) return [];
  const removed = [];
  for (const target of globalAlquimiaCleanupTargets(npmRoot, { readdirFn })) {
    try {
      if (!existsFn(target)) continue;
      rmFn(target, { recursive: true, force: true });
      removed.push(target);
    } catch {
      // ignore permission / busy errors — install may still work
    }
  }
  return removed;
}

/**
 * Resolve npm global root and clean stale alquimia install dirs.
 * @param {Parameters<typeof resolveNpmGlobalRoot>[0] & Parameters<typeof cleanGlobalAlquimiaInstall>[1] & { logPath?: string }} [opts]
 * @returns {{ npmRoot: string | null, removed: string[] }}
 */
export function prepareGlobalInstall(opts = {}) {
  const npmRoot = resolveNpmGlobalRoot(opts);
  const removed = cleanGlobalAlquimiaInstall(npmRoot, opts);
  if (opts.logPath && removed.length) {
    appendUpdateLog(
      opts.logPath,
      `cleaned: ${removed.join(", ")}\n`
    );
  }
  return { npmRoot, removed };
}

/**
 * Append a line to the update log (best-effort).
 * @param {string} logPath
 * @param {string} line
 */
export function appendUpdateLog(logPath, line) {
  try {
    mkdirSync(dirname(logPath), { recursive: true });
    appendFileSync(logPath, line, "utf8");
  } catch {
    // ignore
  }
}

/**
 * Spawn detached global reinstall; log stdout/stderr to update.log.
 * Cleans `<npm root -g>/alquimia` and `.alquimia-*` first (Mac ENOTEMPTY).
 *
 * @param {{
 *   logPath?: string,
 *   spawnFn?: typeof spawn,
 *   spawnSyncFn?: typeof spawnSync,
 *   npmCmd?: string,
 *   installSpec?: string,
 *   prepare?: boolean,
 * }} [opts]
 * @returns {boolean} whether spawn was attempted successfully
 */
export function spawnBackgroundUpdate({
  logPath = defaultLogPath(),
  spawnFn = spawn,
  spawnSyncFn = spawnSync,
  npmCmd = npmBinary(),
  installSpec = INSTALL_SPEC,
  prepare = true,
  ...prepareOpts
} = {}) {
  try {
    mkdirSync(dirname(logPath), { recursive: true });
    appendUpdateLog(
      logPath,
      `\n--- ${new Date().toISOString()} auto-update ---\n`
    );

    if (prepare) {
      prepareGlobalInstall({
        ...prepareOpts,
        spawnSyncFn,
        npmCmd,
        logPath,
      });
    }

    let logFd;
    try {
      logFd = openSync(logPath, "a");
    } catch {
      logFd = "ignore";
    }

    const child = spawnFn(npmCmd, ["install", "-g", installSpec], {
      detached: true,
      stdio: logFd === "ignore" ? "ignore" : ["ignore", logFd, logFd],
      env: process.env,
      windowsHide: true,
    });

    child.once("error", () => {
      // ignore spawn errors (npm missing, etc.)
    });

    child.unref();

    if (typeof logFd === "number") {
      try {
        closeSync(logFd);
      } catch {
        // ignore
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Foreground `npm install -g` for `alquimia update`.
 * Cleans global package + `.alquimia-*` leftovers first.
 *
 * @param {{
 *   spawnFn?: typeof spawn,
 *   spawnSyncFn?: typeof spawnSync,
 *   npmCmd?: string,
 *   installSpec?: string,
 *   stdio?: import('node:child_process').StdioOptions,
 *   prepare?: boolean,
 * }} [opts]
 * @returns {Promise<{ ok: boolean, code: number }>}
 */
export function runUpdateForeground({
  spawnFn = spawn,
  spawnSyncFn = spawnSync,
  npmCmd = npmBinary(),
  installSpec = INSTALL_SPEC,
  stdio = "inherit",
  prepare = true,
  ...prepareOpts
} = {}) {
  if (prepare) {
    try {
      prepareGlobalInstall({ ...prepareOpts, spawnSyncFn, npmCmd });
    } catch {
      // continue — install may still succeed
    }
  }

  return new Promise((resolve) => {
    const child = spawnFn(npmCmd, ["install", "-g", installSpec], {
      stdio,
      env: process.env,
      windowsHide: true,
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
      console.error(style.red(`No pude correr npm: ${err.message}`));
      resolve({ ok: false, code: 1, stdout: capturedOut, stderr: capturedErr });
    });

    child.once("close", (code) => {
      const exit = typeof code === "number" ? code : 1;
      resolve({ ok: exit === 0, code: exit, stdout: capturedOut, stderr: capturedErr });
    });
  });
}

/**
 * Non-blocking auto-update check. May await a short network fetch, but never
 * waits for the reinstall. Prints at most one dim line when an update starts.
 *
 * @param {{
 *   disabled?: boolean,
 *   localVersion?: string,
 *   cachePath?: string,
 *   logPath?: string,
 *   now?: number,
 *   fetchFn?: typeof fetch,
 *   spawnFn?: typeof spawn,
 *   spawnSyncFn?: typeof spawnSync,
 *   remoteUrl?: string,
 *   notify?: (msg: string) => void,
 * }} [opts]
 * @returns {Promise<{ checked: boolean, updated: boolean, skipped?: string }>}
 */
export async function maybeAutoUpdate({
  disabled = false,
  localVersion = getVersion(),
  cachePath = defaultCachePath(),
  logPath = defaultLogPath(),
  now = Date.now(),
  fetchFn = globalThis.fetch,
  spawnFn = spawn,
  spawnSyncFn = spawnSync,
  remoteUrl = REMOTE_PACKAGE_URL,
  notify = (msg) => console.error(style.dim(msg)),
  ...prepareOpts
} = {}) {
  if (disabled) {
    return { checked: false, updated: false, skipped: "disabled" };
  }

  const cache = readCache(cachePath);

  if (isUpdateInFlight(cache, now)) {
    return { checked: false, updated: false, skipped: "in-flight" };
  }

  if (!shouldCheck(cache, now)) {
    return { checked: false, updated: false, skipped: "cache" };
  }

  const remoteVersion = await fetchRemoteVersion(remoteUrl, { fetchFn });
  if (!remoteVersion) {
    // Soft-fail: still bump checkedAt lightly so we don't hammer on outages.
    try {
      writeCache(cachePath, {
        ...(cache ?? {}),
        checkedAt: now,
        localVersion,
        error: "fetch-failed",
      });
    } catch {
      // ignore
    }
    return { checked: true, updated: false, skipped: "fetch-failed" };
  }

  const nextCache = {
    checkedAt: now,
    localVersion,
    remoteVersion,
  };

  if (!isNewer(remoteVersion, localVersion)) {
    try {
      writeCache(cachePath, nextCache);
    } catch {
      // ignore
    }
    return { checked: true, updated: false, skipped: "latest" };
  }

  const started = spawnBackgroundUpdate({
    logPath,
    spawnFn,
    spawnSyncFn,
    ...prepareOpts,
  });
  if (!started) {
    try {
      writeCache(cachePath, { ...nextCache, error: "spawn-failed" });
    } catch {
      // ignore
    }
    return { checked: true, updated: false, skipped: "spawn-failed" };
  }

  try {
    writeCache(cachePath, {
      ...nextCache,
      updateStartedAt: now,
    });
  } catch {
    // ignore
  }

  notify("Actualizando Alquimia en segundo plano…");
  return { checked: true, updated: true };
}

/**
 * Explicit `alquimia update` — foreground install + result message.
 * In TTY/interactive mode, runs Alquimia Runner while the child install runs.
 * @param {{ noInteractive?: boolean, argv?: string[] }} [opts]
 */
export async function runUpdateCommand({
  noInteractive = false,
  argv = process.argv.slice(2),
} = {}) {
  const local = getVersion();
  console.log(
    `${style.bold("Actualizando Alquimia…")} ${style.dim(`(actual: ${local})`)}`
  );
  console.log(style.dim(`npm install -g ${INSTALL_SPEC}`));
  console.log("");

  const { result, playedDino, dinoScore } = await runWithDino(
    async ({ useDino }) => {
      const stdio = useDino ? ["ignore", "pipe", "pipe"] : "inherit";
      return runUpdateForeground({ stdio });
    },
    { noInteractive, argv, env: process.env }
  );

  if (playedDino) {
    const combined = `${result.stdout || ""}${result.stderr || ""}`.trim();
    if (combined) {
      console.log(combined);
    }
    console.log(
      style.dim(`(Alquimia Runner — score mientras actualizabas: ${dinoScore})`)
    );
  }

  if (result.ok) {
    console.log("");
    console.log(
      `${style.green("✓")} Listo. Corré ${style.cyan("alquimia version")} para ver la nueva versión.`
    );
    try {
      writeCache(defaultCachePath(), {
        checkedAt: Date.now(),
        localVersion: local,
        updateStartedAt: Date.now(),
        source: "manual",
      });
    } catch {
      // ignore
    }
    return;
  }

  console.log("");
  console.error(
    style.red(
      `Falló la actualización (exit ${result.code}). Revisá el output de arriba.`
    )
  );
  console.error(style.dim("Si ves ENOTEMPTY en Mac, limpiá e instalá:"));
  console.error(
    style.dim(
      `  rm -rf "$(npm root -g)/alquimia" "$(npm root -g)"/.alquimia-* && npm install -g ${INSTALL_SPEC}`
    )
  );
  process.exitCode = 1;
}
