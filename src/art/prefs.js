import {
  existsSync as fsExistsSync,
  mkdirSync as fsMkdirSync,
  readFileSync as fsReadFileSync,
  writeFileSync as fsWriteFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** Default brand-art opacity (Ghostty + prefs). */
export const DEFAULT_ART_OPACITY = 0.28;

/** Default Ghostty/CSS fit mode. */
export const DEFAULT_ART_FIT = "cover";

/** Allowed `--fit` values. */
export const ART_FIT_VALUES = ["cover", "contain", "stretch"];

/**
 * XDG-ish prefs path: ~/.local/share/alquimia/art-prefs.json
 * @param {{ home?: string }} [opts]
 * @returns {string}
 */
export function artPrefsPath({ home = homedir() } = {}) {
  return join(home, ".local", "share", "alquimia", "art-prefs.json");
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
export function parseOpacity(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1) return null;
  return n;
}

/**
 * @param {unknown} value
 * @returns {"cover"|"contain"|"stretch"|null}
 */
export function parseFit(value) {
  if (value == null) return null;
  const v = String(value).trim().toLowerCase();
  if (ART_FIT_VALUES.includes(v)) return /** @type {"cover"|"contain"|"stretch"} */ (v);
  return null;
}

/**
 * @returns {{ opacity: number, fit: "cover"|"contain"|"stretch" }}
 */
export function defaultArtPrefs() {
  return { opacity: DEFAULT_ART_OPACITY, fit: DEFAULT_ART_FIT };
}

/**
 * Load prefs from disk; missing/invalid → defaults.
 * @param {{
 *   home?: string,
 *   path?: string,
 *   existsSync?: (p: string) => boolean,
 *   readFileSync?: typeof fsReadFileSync,
 * }} [opts]
 * @returns {{ opacity: number, fit: "cover"|"contain"|"stretch", path: string, fromDisk: boolean }}
 */
export function loadArtPrefs(opts = {}) {
  const defaults = defaultArtPrefs();
  const path = opts.path ?? artPrefsPath({ home: opts.home });
  const exists = opts.existsSync ?? fsExistsSync;
  const read = opts.readFileSync ?? fsReadFileSync;

  if (!exists(path)) {
    return { ...defaults, path, fromDisk: false };
  }

  try {
    const raw = JSON.parse(read(path, "utf8"));
    const opacity = parseOpacity(raw?.opacity);
    const fit = parseFit(raw?.fit);
    return {
      opacity: opacity ?? defaults.opacity,
      fit: fit ?? defaults.fit,
      path,
      fromDisk: true,
    };
  } catch {
    return { ...defaults, path, fromDisk: false };
  }
}

/**
 * Persist prefs (creates parent dirs).
 * @param {{ opacity?: number, fit?: string }} prefs
 * @param {{
 *   home?: string,
 *   path?: string,
 *   mkdirSync?: typeof fsMkdirSync,
 *   writeFileSync?: typeof fsWriteFileSync,
 * }} [opts]
 * @returns {{ opacity: number, fit: "cover"|"contain"|"stretch", path: string }}
 */
export function saveArtPrefs(prefs, opts = {}) {
  const current = loadArtPrefs(opts);
  const opacity = parseOpacity(prefs?.opacity) ?? current.opacity;
  const fit = parseFit(prefs?.fit) ?? current.fit;
  const path = opts.path ?? artPrefsPath({ home: opts.home });
  const mkdir = opts.mkdirSync ?? fsMkdirSync;
  const write = opts.writeFileSync ?? fsWriteFileSync;

  mkdir(dirname(path), { recursive: true });
  const payload = { opacity, fit };
  write(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return { ...payload, path };
}

/**
 * Parse `alquimia art` CLI flags from argv tokens (full argv or rest).
 * Supports `--opacity 0.28`, `--opacity=0.28`, `--fit cover`, `--fit=contain`.
 *
 * @param {string[]} argv
 * @returns {{
 *   clear: boolean,
 *   open: boolean,
 *   pathOnly: boolean,
 *   opacity: number | null,
 *   fit: "cover"|"contain"|"stretch"|null,
 *   opacityProvided: boolean,
 *   fitProvided: boolean,
 *   errors: string[],
 * }}
 */
export function parseArtCliArgs(argv = []) {
  const errors = [];
  let clear = false;
  let open = false;
  let pathOnly = false;
  /** @type {number|null} */
  let opacity = null;
  /** @type {"cover"|"contain"|"stretch"|null} */
  let fit = null;
  let opacityProvided = false;
  let fitProvided = false;

  const args = Array.isArray(argv) ? argv : [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a == null) continue;

    if (a === "--clear" || a === "clear") {
      clear = true;
      continue;
    }
    if (a === "--open") {
      open = true;
      continue;
    }
    if (a === "--path") {
      pathOnly = true;
      continue;
    }

    if (a === "--opacity" || a.startsWith("--opacity=")) {
      opacityProvided = true;
      const raw = a.startsWith("--opacity=")
        ? a.slice("--opacity=".length)
        : args[++i];
      const parsed = parseOpacity(raw);
      if (parsed == null) {
        errors.push(
          `Opacity inválida: ${raw ?? "(vacío)"}. Usá un número entre 0 y 1 (ej. --opacity 0.28).`
        );
      } else {
        opacity = parsed;
      }
      continue;
    }

    if (a === "--fit" || a.startsWith("--fit=")) {
      fitProvided = true;
      const raw = a.startsWith("--fit=") ? a.slice("--fit=".length) : args[++i];
      const parsed = parseFit(raw);
      if (parsed == null) {
        errors.push(
          `Fit inválido: ${raw ?? "(vacío)"}. Opciones: ${ART_FIT_VALUES.join(", ")}.`
        );
      } else {
        fit = parsed;
      }
      continue;
    }
  }

  return {
    clear,
    open,
    pathOnly,
    opacity,
    fit,
    opacityProvided,
    fitProvided,
    errors,
  };
}

/**
 * Map alquimia fit → WezTerm width/height tokens.
 * @param {"cover"|"contain"|"stretch"} fit
 * @returns {{ width: string, height: string }}
 */
export function weztermFitTokens(fit) {
  if (fit === "contain") return { width: "Contain", height: "Contain" };
  if (fit === "stretch") return { width: "100%", height: "100%" };
  return { width: "Cover", height: "Cover" };
}

/**
 * Map alquimia fit → Windows Terminal backgroundImageStretchMode.
 * @param {"cover"|"contain"|"stretch"} fit
 * @returns {string}
 */
export function windowsTerminalStretchMode(fit) {
  if (fit === "contain") return "uniform";
  if (fit === "stretch") return "fill";
  return "uniformToFill";
}

/**
 * Map alquimia fit → CSS background-size.
 * @param {"cover"|"contain"|"stretch"} fit
 * @returns {string}
 */
export function cssBackgroundSize(fit) {
  if (fit === "contain") return "contain";
  if (fit === "stretch") return "100% 100%";
  return "cover";
}
