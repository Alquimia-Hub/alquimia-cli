import { spawnSync as fsSpawnSync } from "node:child_process";
import { platform as osPlatform } from "node:os";

/** Injectables so reload logic can be tested without touching real processes. */
export interface ReloadOpts {
  platform?: string;
  env?: Record<string, string | undefined>;
  spawnSync?: typeof import("node:child_process").spawnSync;
  pids?: number[];
  kill?: (pid: number, signal: string) => void;
  signal?: string;
  psOutput?: string | null;
  pgrepPids?: number[];
  skipPgrep?: boolean;
  // Zero-arg seams: the real implementations are closed over `opts`.
  findPids?: () => number[];
  signalPids?: (pids: number[]) => { ok: boolean; signaled?: number[]; [k: string]: unknown };
  appleScriptReload?: () => { ok: boolean; [k: string]: unknown };
  [key: string]: unknown;
}

/** macOS app binary path fragment (exact Contents path). */
export const GHOSTTY_MAC_BIN_FRAGMENT =
  "Ghostty.app/Contents/MacOS/ghostty";

/**
 * True when a process listing row is the Ghostty binary (not a similarly named tool).
 * Prefers exact binary basename `ghostty` (case-insensitive), or the macOS app path.
 *
 * @param {string} comm  process name (ps `comm`)
 * @param {string} args  full command line (ps `args` / `command`)
 * @returns {boolean}
 */
export function isGhosttyProcess(comm: string, args: string): boolean {
  const name = String(comm || "").trim();
  const cmdline = String(args || "").trim();
  // macOS often reports comm as "Ghostty"; Linux as "ghostty".
  if (name.toLowerCase() === "ghostty") return true;

  const exe = firstArgvToken(cmdline);
  if (!exe) return false;

  const base = (exe.split(/[/\\]/).pop() || "").toLowerCase();
  if (base === "ghostty") return true;

  // Path match only when the executable itself is under Ghostty.app (not a random arg).
  if (exe.includes(GHOSTTY_MAC_BIN_FRAGMENT)) return true;

  return false;
}

/**
 * Discover running Ghostty PIDs via `ps` (+ `pgrep` fallback). No new deps.
 * Linux: `ps -eo pid=,comm=,args=`
 * macOS: `ps -axo pid=,comm=,command=`
 *
 * @param {{
 *   platform?: string,
 *   spawnSync?: typeof fsSpawnSync,
 *   psOutput?: string,
 *   pgrepPids?: number[],
 *   skipPgrep?: boolean,
 * }} [opts]
 * @returns {number[]}
 */
export function findGhosttyPids(opts: ReloadOpts = {}): number[] {
  const plat = opts.platform ?? osPlatform();
  const run = opts.spawnSync ?? fsSpawnSync;
  const pids = new Set<number>();

  const output =
    opts.psOutput != null
      ? String(opts.psOutput)
      : runPsListing(plat, run);

  if (output) {
    for (const line of output.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const m = trimmed.match(/^(\d+)\s+(\S+)(?:\s+(.*))?$/);
      if (!m) continue;
      const pid = Number(m[1]);
      const comm = m[2];
      const args = m[3] || "";
      if (!Number.isFinite(pid) || pid <= 0) continue;
      if (isGhosttyProcess(comm, args || comm)) pids.add(pid);
    }
  }

  // Supplemental discovery when ps columns are odd / empty.
  // Skip when caller injected psOutput-only fixtures unless pgrepPids given.
  if (opts.pgrepPids) {
    for (const pid of opts.pgrepPids) {
      if (Number.isFinite(pid) && pid > 0) pids.add(pid);
    }
  } else if (!opts.skipPgrep && opts.psOutput == null) {
    for (const pid of findPidsViaPgrep(run)) pids.add(pid);
  }

  return [...pids].sort((a, b) => a - b);
}

/**
 * Send SIGUSR2 to Ghostty process(es). Ghostty ≥ 1.2 reloads config on SIGUSR2
 * (PR #7751). Does not terminate the process.
 *
 * @param {number[]} pids
 * @param {{
 *   kill?: (pid: number, signal?: string) => void,
 *   signal?: string,
 * }} [opts]
 * @returns {{ ok: boolean, signaled: number[], failed: Array<{ pid: number, error: string }> }}
 */
export function signalGhosttySigusr2(pids: number[], opts: ReloadOpts = {}) {
  const kill = opts.kill ?? process.kill.bind(process);
  const signal = opts.signal ?? "SIGUSR2";
  const signaled = [];
  const failed = [];

  for (const pid of pids) {
    try {
      kill(pid, signal);
      signaled.push(pid);
    } catch (err) {
      failed.push({
        pid,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { ok: signaled.length > 0, signaled, failed };
}

/**
 * macOS fallback: activate Ghostty and send reload_config (⌘⇧,).
 * Requires Accessibility permission for System Events keystroke automation.
 *
 * @param {{
 *   spawnSync?: typeof fsSpawnSync,
 * }} [opts]
 * @returns {{ ok: boolean, error?: string }}
 */
export function reloadGhosttyViaAppleScript(opts: ReloadOpts = {}) {
  const run = opts.spawnSync ?? fsSpawnSync;
  // Activate first so the keystroke hits Ghostty (not whatever was frontmost).
  const script = [
    'tell application "Ghostty" to activate',
    "delay 0.2",
    'tell application "System Events" to keystroke "," using {command down, shift down}',
  ].join("\n");

  try {
    const result = run("osascript", ["-e", script], {
      encoding: "utf8",
      timeout: 8000,
    });
    if ((result.error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return { ok: false, error: "osascript no encontrado" };
    }
    if (result.status !== 0) {
      return {
        ok: false,
        error:
          (result.stderr && String(result.stderr).trim()) ||
          "osascript falló (¿permiso de Accesibilidad para terminal/CLI?)",
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Best-effort Ghostty config reload after writing config.
 * 1) SIGUSR2 to matching PIDs (preferred, Ghostty 1.2+)
 * 2) macOS: AppleScript ⌘⇧, if no PID or signal failed
 *
 * @param {{
 *   platform?: string,
 *   findPids?: () => number[],
 *   signalPids?: (pids: number[]) => { ok: boolean, signaled: number[], failed: unknown[] },
 *   appleScriptReload?: () => { ok: boolean, error?: string },
 *   spawnSync?: typeof fsSpawnSync,
 *   kill?: (pid: number, signal?: string) => void,
 *   psOutput?: string,
 * }} [opts]
 * @returns {{
 *   ok: boolean,
 *   method: 'sigusr2' | 'applescript' | null,
 *   pids: number[],
 *   error?: string,
 * }}
 */
export function reloadGhosttyConfig(opts: ReloadOpts = {}) {
  const plat = opts.platform ?? osPlatform();
  const findPids =
    opts.findPids ??
    (() =>
      findGhosttyPids({
        platform: plat,
        spawnSync: opts.spawnSync,
        psOutput: opts.psOutput,
      }));
  const signalPids =
    opts.signalPids ??
    ((pids: number[]) =>
      signalGhosttySigusr2(pids, {
        kill: opts.kill,
      }));
  const appleScriptReload =
    opts.appleScriptReload ??
    (() => reloadGhosttyViaAppleScript({ spawnSync: opts.spawnSync }));

  const pids = findPids();
  if (pids.length > 0) {
    const signaled = signalPids(pids);
    if (signaled.ok) {
      return { ok: true, method: "sigusr2", pids: signaled.signaled };
    }
  }

  if (plat === "darwin") {
    const as = appleScriptReload();
    if (as.ok) {
      return { ok: true, method: "applescript", pids };
    }
    return {
      ok: false,
      method: null,
      pids,
      error:
        as.error ||
        (pids.length === 0
          ? "No encontré proceso Ghostty ni pude enviar ⌘⇧,"
          : "SIGUSR2 falló y AppleScript tampoco pudo recargar"),
    };
  }

  return {
    ok: false,
    method: null,
    pids,
    error:
      pids.length === 0
        ? "No encontré un proceso ghostty en ejecución"
        : "No pude enviar SIGUSR2 a Ghostty",
  };
}

/**
 * @param {string} plat
 * @param {typeof fsSpawnSync} run
 * @returns {string}
 */
function runPsListing(plat: string, run: NonNullable<ReloadOpts["spawnSync"]>) {
  const args =
    plat === "darwin"
      ? ["-axo", "pid=,comm=,command="]
      : ["-eo", "pid=,comm=,args="];
  try {
    const result = run("ps", args, {
      encoding: "utf8",
      timeout: 5000,
    });
    if (result.status !== 0 || result.error) return "";
    return String(result.stdout || "");
  } catch {
    return "";
  }
}

/**
 * Exact-name / macOS-path pgrep fallback (still avoids unrelated *ghostty* tools).
 * @param {typeof fsSpawnSync} run
 * @returns {number[]}
 */
function findPidsViaPgrep(run: NonNullable<ReloadOpts["spawnSync"]>) {
  const found = new Set<number>();
  const queries = [
    ["-x", "ghostty"],
    ["-ix", "ghostty"],
    ["-f", GHOSTTY_MAC_BIN_FRAGMENT],
  ];
  for (const args of queries) {
    try {
      const result = run("pgrep", args, {
        encoding: "utf8",
        timeout: 3000,
      });
      if (result.status !== 0 && result.status !== 1) continue;
      for (const line of String(result.stdout || "").split(/\r?\n/)) {
        const pid = Number(line.trim());
        if (Number.isFinite(pid) && pid > 0) found.add(pid);
      }
    } catch {
      /* ignore */
    }
  }
  return [...found];
}

/**
 * First argv token; handles simple quoted paths.
 * @param {string} cmdline
 * @returns {string}
 */
function firstArgvToken(cmdline: string): string {
  const s = String(cmdline || "").trim();
  if (!s) return "";
  if (s[0] === '"' || s[0] === "'") {
    const q = s[0];
    const end = s.indexOf(q, 1);
    if (end > 1) return s.slice(1, end);
  }
  return s.split(/\s+/)[0] || "";
}
