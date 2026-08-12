import { spawnSync as fsSpawnSync } from "node:child_process";
import { platform as osPlatform } from "node:os";

/** macOS app binary path fragment (exact Contents path). */
export const GHOSTTY_MAC_BIN_FRAGMENT =
  "Ghostty.app/Contents/MacOS/ghostty";

/**
 * True when a process listing row is the Ghostty binary (not a similarly named tool).
 * Prefers exact binary basename `ghostty`, or the macOS app Contents path.
 *
 * @param {string} comm  process name (ps `comm`)
 * @param {string} args  full command line (ps `args` / `command`)
 * @returns {boolean}
 */
export function isGhosttyProcess(comm, args) {
  const name = String(comm || "").trim();
  const cmdline = String(args || "").trim();
  if (name === "ghostty") return true;

  const exe = firstArgvToken(cmdline);
  if (!exe) return false;

  const base = exe.split(/[/\\]/).pop() || "";
  if (base === "ghostty") return true;

  // Path match only when the executable itself is under Ghostty.app (not a random arg).
  if (exe.includes(GHOSTTY_MAC_BIN_FRAGMENT)) return true;

  return false;
}

/**
 * Discover running Ghostty PIDs via `ps` (no new deps).
 * Linux: `ps -eo pid=,comm=,args=`
 * macOS: `ps -axo pid=,comm=,command=`
 *
 * @param {{
 *   platform?: string,
 *   spawnSync?: typeof fsSpawnSync,
 *   psOutput?: string,
 * }} [opts]
 * @returns {number[]}
 */
export function findGhosttyPids(opts = {}) {
  const plat = opts.platform ?? osPlatform();
  const output =
    opts.psOutput != null
      ? String(opts.psOutput)
      : runPsListing(plat, opts.spawnSync ?? fsSpawnSync);
  if (!output) return [];

  const pids = new Set();
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
export function signalGhosttySigusr2(pids, opts = {}) {
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
export function reloadGhosttyViaAppleScript(opts = {}) {
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
    if (result.error && result.error.code === "ENOENT") {
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
export function reloadGhosttyConfig(opts = {}) {
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
    ((pids) =>
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
function runPsListing(plat, run) {
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
 * First argv token; handles simple quoted paths.
 * @param {string} cmdline
 * @returns {string}
 */
function firstArgvToken(cmdline) {
  const s = String(cmdline || "").trim();
  if (!s) return "";
  if (s[0] === '"' || s[0] === "'") {
    const q = s[0];
    const end = s.indexOf(q, 1);
    if (end > 1) return s.slice(1, end);
  }
  return s.split(/\s+/)[0] || "";
}
