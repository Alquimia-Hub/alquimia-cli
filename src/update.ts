import {
  spawn,
  spawnSync,
  type ChildProcess,
  type StdioOptions,
} from "node:child_process";
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
import { getVersion } from "./version.ts";

/** Cached result of the last remote-version check. */
export interface UpdateCache {
  checkedAt?: number;
  localVersion?: string;
  remoteVersion?: string | null;
  updateStartedAt?: number;
  source?: string;
  [key: string]: unknown;
}

/** Injectables shared by the update helpers so tests never touch the network. */
/**
 * Minimal seam types.
 *
 * The module only touches a handful of members on the child-process results,
 * so the seams describe that surface instead of Node's full overloaded
 * signatures — which no test double can satisfy.
 */
export type SpawnLike = (
  command: string,
  args: string[],
  options?: Record<string, unknown>,
) => Pick<ChildProcess, "once" | "unref" | "stdout" | "stderr"> | any;

export type SpawnSyncLike = (
  command: string,
  args?: string[],
  options?: Record<string, unknown>,
) => {
  status?: number | null;
  stdout?: string | Buffer | null;
  stderr?: string | Buffer | null;
  error?: Error;
};

/** Minimal surface `fetchRemoteVersion` actually uses. */
export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> },
) => Promise<{ ok: boolean; status?: number; text: () => Promise<string> }>;

export interface UpdateOpts {
  home?: string;
  env?: Record<string, string | undefined>;
  argv?: string[];
  npmCmd?: string;
  installSpec?: string;
  cachePath?: string;
  logPath?: string;
  npmRoot?: string;
  stdio?: import("node:child_process").StdioOptions;
  noInteractive?: boolean;
  spawn?: SpawnLike;
  spawnSync?: SpawnSyncLike;
  // Injection seams use `*Fn` names throughout this module.
  rmFn?: typeof rmSync;
  readdirFn?: typeof readdirSync;
  existsFn?: typeof existsSync;
  spawnSyncFn?: SpawnSyncLike;
  spawnFn?: SpawnLike;
  fallbacks?: readonly string[];
  timeoutMs?: number;
  [key: string]: unknown;
}
import { style, t } from "./ui/style.ts";
import { emit, emitErr, flushReport } from "./ui/report.ts";
import { runWithDino } from "./ui/dino.ts";

/** Skip network if last successful check was within this window. */
export const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/** Don't spawn another background install if one was started recently. */
export const UPDATE_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

export const REMOTE_PACKAGE_URL =
  "https://raw.githubusercontent.com/Alquimia-Hub/alquimia-cli/main/package.json";

export const INSTALL_SPEC = "alquimia-cli";

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
export function compareSemver(a: string, b: string): number {
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
function parseSemver(version: string) {
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
export function isNewer(remote: string, local: string): boolean {
  return compareSemver(remote, local) > 0;
}

/**
 * Whether we should hit the network given a cache payload and now.
 * @param {{ checkedAt?: number } | null | undefined} cache
 * @param {number} [now]
 * @param {number} [intervalMs]
 */
export function shouldCheck(
  cache: UpdateCache | null,
  now: number = Date.now(),
  intervalMs: number = CHECK_INTERVAL_MS,
): boolean {
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
  cache: UpdateCache | null,
  now: number = Date.now(),
  cooldownMs: number = UPDATE_COOLDOWN_MS,
): boolean {
  if (!cache || typeof cache.updateStartedAt !== "number") return false;
  if (!Number.isFinite(cache.updateStartedAt)) return false;
  return now - cache.updateStartedAt < cooldownMs;
}

export function defaultAlquimiaDir(home: string = homedir()): string {
  return join(home, ".alquimia");
}

export function defaultCachePath(home: string = homedir()): string {
  return join(defaultAlquimiaDir(home), "update-cache.json");
}

export function defaultLogPath(home: string = homedir()): string {
  return join(defaultAlquimiaDir(home), "update.log");
}

/**
 * @param {string} cachePath
 * @returns {object | null}
 */
export function readCache(cachePath: string): UpdateCache | null {
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
export function writeCache(cachePath: string, data: UpdateCache): void {
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
}: {
  argv?: string[];
  env?: Record<string, string | undefined>;
  stdoutIsTTY?: boolean;
} = {}): boolean {
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
  url: string = REMOTE_PACKAGE_URL,
  {
    fetchFn = globalThis.fetch as unknown as FetchLike,
    timeoutMs = FETCH_TIMEOUT_MS,
  }: { fetchFn?: FetchLike; timeoutMs?: number } = {},
): Promise<string | null> {
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

function npmBinary(): string {
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
}: {
  spawnSyncFn?: SpawnSyncLike;
  npmCmd?: string;
  fallbacks?: readonly string[];
  existsFn?: typeof existsSync;
  timeoutMs?: number;
} = {}): string | null {
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
  npmRoot: string | null,
  { readdirFn = readdirSync }: { readdirFn?: typeof readdirSync } = {},
): string[] {
  if (!npmRoot) return [];
  // `alquimia` is the pre-npm directory name; keep clearing it so upgrades
  // from a github-installed copy do not leave a stale package behind.
  const targets = [join(npmRoot, "alquimia-cli"), join(npmRoot, "alquimia")];
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
  npmRoot: string | null,
  {
    rmFn = rmSync,
    readdirFn = readdirSync,
    existsFn = existsSync,
  }: {
    rmFn?: typeof rmSync;
    readdirFn?: typeof readdirSync;
    existsFn?: typeof existsSync;
  } = {},
): string[] {
  if (!npmRoot) return [];
  const removed: string[] = [];
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
export function prepareGlobalInstall(opts: UpdateOpts = {}) {
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
export function appendUpdateLog(logPath: string, line: string): void {
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
  spawnFn = spawn as SpawnLike,
  spawnSyncFn = spawnSync as SpawnSyncLike,
  npmCmd = npmBinary(),
  installSpec = INSTALL_SPEC,
  prepare = true,
  ...prepareOpts
}: UpdateOpts & { prepare?: boolean } = {}) {
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

    let logFd: number | "ignore";
    try {
      logFd = openSync(logPath, "a");
    } catch {
      logFd = "ignore";
    }

    const child: ChildProcess = spawnFn(npmCmd, ["install", "-g", installSpec], {
      detached: true,
      stdio: (logFd === "ignore"
        ? "ignore"
        : ["ignore", logFd, logFd]) as StdioOptions,
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
/** Result of a foreground `npm install -g`. */
export interface ForegroundResult {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
}

export function runUpdateForeground({
  spawnFn = spawn as SpawnLike,
  spawnSyncFn = spawnSync as SpawnSyncLike,
  npmCmd = npmBinary(),
  installSpec = INSTALL_SPEC,
  stdio = "inherit" as StdioOptions,
  prepare = true,
  ...prepareOpts
}: UpdateOpts & { prepare?: boolean } = {}): Promise<ForegroundResult> {
  if (prepare) {
    try {
      prepareGlobalInstall({ ...prepareOpts, spawnSyncFn, npmCmd });
    } catch {
      // continue — install may still succeed
    }
  }

  return new Promise<ForegroundResult>((resolve) => {
    const child: ChildProcess = spawnFn(npmCmd, ["install", "-g", installSpec], {
      stdio: stdio as StdioOptions,
      env: process.env,
      windowsHide: true,
    });

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
      emitErr(t`${style.red(`No pude correr npm: ${err.message}`)}`);
      resolve({ ok: false, code: 1, stdout: capturedOut, stderr: capturedErr });
    });

    child.once("close", (code: number | null) => {
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
  fetchFn = globalThis.fetch as unknown as FetchLike,
  spawnFn = spawn as SpawnLike,
  spawnSyncFn = spawnSync as SpawnSyncLike,
  remoteUrl = REMOTE_PACKAGE_URL,
  notify = (msg: string) => emitErr(t`${style.dim(msg)}`),
  ...prepareOpts
}: UpdateOpts & {
  disabled?: boolean;
  localVersion?: string;
  now?: number;
  fetchFn?: FetchLike;
  remoteUrl?: string;
  notify?: (msg: string) => void;
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
  emit(t`${style.bold("Actualizando Alquimia…")} ${style.dim(`(actual: ${local})`)}`);
  emit(t`${style.dim(`npm install -g ${INSTALL_SPEC}`)}`);
  emit("");
  await flushReport();

  const { result, playedDino, dinoScore } = await runWithDino(
    async ({ useDino }) => {
      const stdio: StdioOptions = useDino
        ? ["ignore", "pipe", "pipe"]
        : "inherit";
      return runUpdateForeground({ stdio });
    },
    { noInteractive, argv, env: process.env }
  );

  if (playedDino) {
    const combined = `${result.stdout || ""}${result.stderr || ""}`.trim();
    if (combined) {
      emit(combined);
    }
    emit(t`${style.dim(`(Alquimia Runner — score mientras actualizabas: ${dinoScore})`)}`);
  }

  if (result.ok) {
    emit("");
    emit(t`${style.green("✓")} Listo. Corré ${style.cyan("alquimia version")} para ver la nueva versión.`);
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
    await flushReport();
    return;
  }

  await flushReport();
  emitErr(t`${style.red(
      `Falló la actualización (exit ${result.code}). Revisá el output de arriba.`
    )}`);
  emitErr(t`${style.dim("Si ves ENOTEMPTY en Mac, limpiá e instalá:")}`);
  emitErr(t`${style.dim(
      `  rm -rf "$(npm root -g)/alquimia" "$(npm root -g)"/.alquimia-* && npm install -g ${INSTALL_SPEC}`
    )}`);
  process.exitCode = 1;
}
