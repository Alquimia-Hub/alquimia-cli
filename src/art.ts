import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openUrl } from "./open-url.ts";
import type { ArtBackendResult, TerminalId } from "./types.ts";
import { style, t } from "./ui/style.ts";
import { emit, emitErr, flushReport } from "./ui/report.ts";
import { detectTerminal, SUPPORTED_TERMINALS } from "./art/detect.ts";
import { ensurePersistedArt } from "./art/persist.ts";
import {
  writeItermBackground,
  setKittyBackground,
  setGhosttyBackground,
  clearGhosttyBackground,
  setWeztermBackground,
  clearWeztermBackground,
  setContourBackground,
  clearContourBackground,
  setHyperBackground,
  clearHyperBackground,
  setTabbyBackground,
  clearTabbyBackground,
  setWindowsTerminalBackground,
  clearWindowsTerminalBackground,
  setTilixBackground,
  clearTilixBackground,
  setTerminologyBackground,
  clearTerminologyBackground,
  clearOrphanAlquimiaGhosttyKeys,
  isAlquimiaGhosttyImagePath,
  // re-exports for tests / public API
  ghosttyConfigCandidates,
  resolveGhosttyConfigPath,
  patchGhosttyConfigContent,
  clearGhosttyArtFromConfig,
  ghosttyReloadHint,
  patchWeztermConfigContent,
  clearWeztermArtFromConfig,
  weztermConfigCandidates,
  resolveWeztermConfigPath,
  patchContourConfigContent,
  clearContourArtFromConfig,
  contourConfigCandidates,
  patchHyperConfigContent,
  clearHyperArtFromConfig,
  hyperConfigCandidates,
  patchTabbyConfigContent,
  clearTabbyArtFromConfig,
  tabbyConfigCandidates,
  patchWindowsTerminalSettings,
  clearWindowsTerminalSettings,
  windowsTerminalSettingsCandidates,
  toWindowsPathIfWsl,
  GHOSTTY_DEFAULT_OPACITY,
} from "./art/backends.ts";
import {
  BLOCK_BEGIN,
  BLOCK_END,
  GHOSTTY_BLOCK_BEGIN,
  GHOSTTY_BLOCK_END,
  LEGACY_GHOSTTY_MARKER,
  patchConfigBlock,
  clearConfigBlock,
} from "./art/config-block.ts";
import {
  findGhosttyPids,
  isGhosttyProcess,
  reloadGhosttyConfig,
  reloadGhosttyViaAppleScript,
  signalGhosttySigusr2,
} from "./art/ghostty-reload.ts";
import {
  ALQUIMIA_TERMINAL_PROFILE,
  appleTerminalManualTip,
  appleTerminalStatePath,
  clearAppleTerminalBackground,
  readAppleTerminalState,
  setAppleTerminalBackground,
  writeAppleTerminalState,
} from "./art/apple-terminal.ts";
import {
  DEFAULT_ART_FIT,
  DEFAULT_ART_OPACITY,
  artPrefsPath,
  cssBackgroundSize,
  defaultArtPrefs,
  loadArtPrefs,
  parseArtCliArgs,
  parseFit,
  parseOpacity,
  saveArtPrefs,
  weztermFitTokens,
  windowsTerminalStretchMode,
} from "./art/prefs.ts";

const ART_FILENAME = "art.png";

export {
  detectTerminal,
  SUPPORTED_TERMINALS,
  ensurePersistedArt,
  artPrefsPath,
  defaultArtPrefs,
  loadArtPrefs,
  saveArtPrefs,
  parseArtCliArgs,
  parseFit,
  parseOpacity,
  weztermFitTokens,
  windowsTerminalStretchMode,
  cssBackgroundSize,
  DEFAULT_ART_FIT,
  DEFAULT_ART_OPACITY,
  ghosttyConfigCandidates,
  resolveGhosttyConfigPath,
  patchGhosttyConfigContent,
  clearGhosttyArtFromConfig,
  clearOrphanAlquimiaGhosttyKeys,
  isAlquimiaGhosttyImagePath,
  ghosttyReloadHint,
  patchWeztermConfigContent,
  clearWeztermArtFromConfig,
  weztermConfigCandidates,
  resolveWeztermConfigPath,
  patchContourConfigContent,
  clearContourArtFromConfig,
  contourConfigCandidates,
  patchHyperConfigContent,
  clearHyperArtFromConfig,
  hyperConfigCandidates,
  patchTabbyConfigContent,
  clearTabbyArtFromConfig,
  tabbyConfigCandidates,
  patchWindowsTerminalSettings,
  clearWindowsTerminalSettings,
  windowsTerminalSettingsCandidates,
  toWindowsPathIfWsl,
  BLOCK_BEGIN,
  BLOCK_END,
  GHOSTTY_BLOCK_BEGIN,
  GHOSTTY_BLOCK_END,
  LEGACY_GHOSTTY_MARKER,
  GHOSTTY_DEFAULT_OPACITY,
  patchConfigBlock,
  clearConfigBlock,
  findGhosttyPids,
  isGhosttyProcess,
  reloadGhosttyConfig,
  reloadGhosttyViaAppleScript,
  signalGhosttySigusr2,
  ALQUIMIA_TERMINAL_PROFILE,
  appleTerminalManualTip,
  appleTerminalStatePath,
  readAppleTerminalState,
  writeAppleTerminalState,
  setAppleTerminalBackground,
  clearAppleTerminalBackground,
  setGhosttyBackground,
  clearGhosttyBackground,
  setWeztermBackground,
  clearWeztermBackground,
  setContourBackground,
  clearContourBackground,
  setHyperBackground,
  clearHyperBackground,
  setTabbyBackground,
  clearTabbyBackground,
  setWindowsTerminalBackground,
  clearWindowsTerminalBackground,
  setTilixBackground,
  clearTilixBackground,
  setTerminologyBackground,
  clearTerminologyBackground,
};

/** @deprecated use GHOSTTY_BLOCK_BEGIN */
export const GHOSTTY_ART_MARKER = GHOSTTY_BLOCK_BEGIN;

/**
 * Absolute path to bundled brand art (works from source tree and global npm install).
 * @returns {string}
 */
export function getArtPath() {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "assets", ART_FILENAME);
}

/**
 * Open a local file with the OS default opener.
 * @param {string} path
 */
async function openFile(path: string) {
  return openUrl(path);
}

function supportedListLine() {
  return SUPPORTED_TERMINALS.map((term) => term.name).join(", ");
}

function printUnsupportedHelp(terminal: TerminalId, { clearing = false } = {}) {
  const labels: Partial<Record<TerminalId, string>> = {
    alacritty:
      "Alacritty no tiene wallpaper nativo (solo forks). No inventamos claves de config.",
    konsole:
      "Konsole guarda el wallpaper en el color scheme; no lo tocamos (es invasivo).",
    vscode:
      "La terminal integrada de VS Code / Cursor no soporta fondo vía CLI.",
    "gnome-terminal":
      "GNOME Terminal / Ptyxis no exponen un wallpaper usable desde la CLI.",
    unsupported: clearing
      ? "No pude sacar el fondo desde esta terminal."
      : "Esta terminal no deja setear el fondo desde la CLI.",
  };

  const action =
    labels[terminal] ||
    (clearing
      ? "No pude sacar el fondo desde esta terminal."
      : "Esta terminal no deja setear el fondo desde la CLI.");

  emit(t`${style.yellow(action)}`);
  emit(t`${style.dim(
      `Soportados: ${supportedListLine()}.`
    )}`);
  emit(t`${style.dim(
      "No fingimos que funcionó. Tip: alquimia art --open  ·  --path  ·  --clear"
    )}`);
}

/**
 * @param {{
 *   clear?: boolean,
 *   open?: boolean,
 *   pathOnly?: boolean,
 *   opacity?: number | null,
 *   fit?: "cover"|"contain"|"stretch" | null,
 *   opacityProvided?: boolean,
 *   fitProvided?: boolean,
 * }} [opts]
 */
async function runArtInner({
  clear = false,
  open = false,
  pathOnly = false,
  opacity = null,
  fit = null,
  opacityProvided = false,
  fitProvided = false,
} = {}) {
  const bundledPath = getArtPath();

  if (!existsSync(bundledPath)) {
    emitErr(t`${style.red(`No encuentro el asset: ${bundledPath}`)}`);
    process.exitCode = 1;
    return;
  }

  if (pathOnly) {
    // `--path` is meant for `$(alquimia art --path)`; keep it raw stdout.
    console.log(bundledPath);
    return;
  }

  const prefs = loadArtPrefs();
  const effectiveOpacity =
    opacityProvided && opacity != null ? opacity : prefs.opacity;
  const effectiveFit = fitProvided && fit != null ? fit : prefs.fit;

  // Persist prefs when flags change them. `--clear` keeps prefs (does not wipe).
  if (!clear && (opacityProvided || fitProvided)) {
    try {
      saveArtPrefs({
        opacity: effectiveOpacity,
        fit: effectiveFit,
      });
    } catch {
      // Soft-fail: still try to apply art.
    }
  }

  // Persist so config-file terminals keep working after npm -g updates.
  let artPath = bundledPath;
  try {
    artPath = ensurePersistedArt(bundledPath);
  } catch {
    artPath = bundledPath;
  }

  const terminal = detectTerminal();
  const artOpts = { opacity: effectiveOpacity, fit: effectiveFit };
  let backgroundOk = false;
  let didSomethingUseful = false;

  if (clear) {
    backgroundOk = await clearForTerminal(terminal, artPath);
    didSomethingUseful = backgroundOk;
  } else {
    backgroundOk = await setForTerminal(terminal, artPath, artOpts);
    didSomethingUseful = backgroundOk;
  }

  if (open) {
    try {
      await openFile(bundledPath);
      emit(t`${style.green("✓")} Abriendo ${style.bold(ART_FILENAME)}…\n  ${style.dim(bundledPath)}`);
      didSomethingUseful = true;
    } catch (err) {
      emitErr(t`${style.red(`No pude abrir el archivo: ${(err as Error).message}`)}`);
      emitErr(t`${style.dim(`Path: ${bundledPath}`)}`);
    }
  }

  if (!didSomethingUseful) {
    process.exitCode = 1;
  }
}

/**
 * @param {string} terminal
 * @param {string} artPath
 * @param {{ opacity?: number, fit?: "cover"|"contain"|"stretch" }} [artOpts]
 * @returns {Promise<boolean>}
 */
async function setForTerminal(
  terminal: TerminalId,
  artPath: string,
  artOpts: { opacity?: number; fit?: import("./types.ts").ArtFit } = {},
): Promise<boolean> {
  if (terminal === "iterm2") {
    writeItermBackground(artPath);
    emit(t`${style.green("✓")} Fondo de terminal listo (iTerm2 OSC). Seguí usando la CLI encima.`);
    return true;
  }

  if (terminal === "kitty") {
    const result = await setKittyBackground(artPath);
    if (result.ok) {
      emit(t`${style.green("✓")} Fondo de terminal listo (Kitty). Seguí usando la CLI encima.`);
      return true;
    }
    emitErr(t`${style.red("No pude setear el fondo en Kitty.")}`);
    if (result.tip) emitErr(t`${style.dim(result.tip)}`);
    emit(t`${style.dim(`Asset: ${artPath}`)}`);
    return false;
  }

  if (terminal === "ghostty") {
    // Config write + SIGUSR2 (Ghostty 1.2+) / macOS ⌘⇧, fallback — no live OSC.
    return reportConfigResult(
      setGhosttyBackground(artPath, artOpts),
      "Ghostty",
      artPath
    );
  }

  if (terminal === "apple-terminal") {
    return reportAppleTerminalSet(setAppleTerminalBackground(artPath), artPath);
  }

  if (terminal === "wezterm") {
    return reportConfigResult(
      setWeztermBackground(artPath, artOpts),
      "WezTerm",
      artPath
    );
  }

  if (terminal === "contour") {
    return reportConfigResult(
      setContourBackground(artPath, artOpts),
      "Contour",
      artPath
    );
  }

  if (terminal === "hyper") {
    return reportConfigResult(
      setHyperBackground(artPath, artOpts),
      "Hyper",
      artPath
    );
  }

  if (terminal === "tabby") {
    return reportConfigResult(
      setTabbyBackground(artPath, artOpts),
      "Tabby",
      artPath
    );
  }

  if (terminal === "windows-terminal") {
    return reportConfigResult(
      setWindowsTerminalBackground(artPath, artOpts),
      "Windows Terminal",
      artPath
    );
  }

  if (terminal === "tilix") {
    const result = setTilixBackground(artPath);
    if (result.ok) {
      emit(t`${style.green("✓")} Fondo setado en Tilix (gsettings).`);
      if (result.tip) emit(t`${style.dim(result.tip)}`);
      return true;
    }
    emitErr(t`${style.red("No pude setear el fondo en Tilix.")}`);
    if (result.error) emitErr(t`${style.dim(result.error)}`);
    emit(t`${style.dim(`Asset: ${artPath}`)}`);
    return false;
  }

  if (terminal === "terminology") {
    const result = setTerminologyBackground(artPath);
    if (result.ok) {
      emit(t`${style.green("✓")} Fondo setado en Terminology (tybg).`);
      return true;
    }
    emitErr(t`${style.red("No pude setear el fondo en Terminology.")}`);
    if (result.error) emitErr(t`${style.dim(result.error)}`);
    emit(t`${style.dim(`Asset: ${artPath}`)}`);
    return false;
  }

  printUnsupportedHelp(terminal, { clearing: false });
  emit(t`${style.dim(`Asset: ${artPath}`)}`);
  return false;
}

/**
 * @param {string} terminal
 * @param {string} artPath
 * @returns {Promise<boolean>}
 */
async function clearForTerminal(terminal: TerminalId, artPath: string) {
  if (terminal === "iterm2") {
    writeItermBackground(null);
    emit(t`${style.green("✓")} Fondo sacado (iTerm2).`);
    return true;
  }

  if (terminal === "kitty") {
    const result = await setKittyBackground(null);
    if (result.ok) {
      emit(t`${style.green("✓")} Fondo sacado (Kitty).`);
      return true;
    }
    emitErr(t`${style.red("No pude sacar el fondo en Kitty.")}`);
    if (result.tip) emitErr(t`${style.dim(result.tip)}`);
    return false;
  }

  if (terminal === "ghostty") {
    return reportClearResult(
      clearGhosttyBackground({ artPath }),
      "Ghostty"
    );
  }

  if (terminal === "apple-terminal") {
    return reportAppleTerminalClear(clearAppleTerminalBackground());
  }

  if (terminal === "wezterm") {
    return reportClearResult(clearWeztermBackground(), "WezTerm");
  }

  if (terminal === "contour") {
    return reportClearResult(clearContourBackground(), "Contour");
  }

  if (terminal === "hyper") {
    return reportClearResult(clearHyperBackground(), "Hyper");
  }

  if (terminal === "tabby") {
    return reportClearResult(clearTabbyBackground(), "Tabby");
  }

  if (terminal === "windows-terminal") {
    return reportClearResult(
      clearWindowsTerminalBackground(),
      "Windows Terminal"
    );
  }

  if (terminal === "tilix") {
    const result = clearTilixBackground();
    if (result.ok) {
      emit(t`${style.green("✓")} Fondo sacado en Tilix.`);
      return true;
    }
    emitErr(t`${style.red("No pude sacar el fondo en Tilix.")}`);
    if (result.error) emitErr(t`${style.dim(result.error)}`);
    return false;
  }

  if (terminal === "terminology") {
    const result = clearTerminologyBackground();
    if (result.ok) {
      emit(t`${style.green("✓")} Fondo sacado en Terminology.`);
      return true;
    }
    emitErr(t`${style.red("No pude sacar el fondo en Terminology.")}`);
    if (result.error) emitErr(t`${style.dim(result.error)}`);
    return false;
  }

  printUnsupportedHelp(terminal, { clearing: true });
  return false;
}

function reportConfigResult(
  result: ArtBackendResult,
  name: string,
  artPath: string,
  { successExtra }: { successExtra?: string } = {},
) {
  if (result.ok) {
    const message =
      result.successMessage ||
      `Fondo escrito para ${name} (no es universal en todas las terminales).`;
    emit(t`${style.green("✓")} ${message}`);
    const extra = result.successExtra ?? successExtra;
    if (extra) emit(t`${style.dim(extra)}`);
    if (result.configPath) emit(t`${style.dim(`Config: ${result.configPath}`)}`);
    if (result.reloadHint) emit(t`${style.dim(result.reloadHint)}`);
    if (result.tip) emit(t`${style.dim(result.tip)}`);
    return true;
  }
  emitErr(t`${style.red(`No pude setear el fondo en ${name}.`)}`);
  if (result.error) emitErr(t`${style.dim(result.error)}`);
  emit(t`${style.dim(`Asset: ${artPath}`)}`);
  return false;
}

function reportClearResult(result: ArtBackendResult, name: string) {
  if (result.ok) {
    const message =
      result.successMessage ||
      (result.changed === false
        ? `No había líneas de alquimia art en ${name}.`
        : `Fondo sacado de ${name}.`);
    emit(t`${style.green("✓")} ${message}`);
    if (result.configPath) {
      emit(t`${style.dim(`Config: ${result.configPath}`)}`);
    }
    if (result.reloadHint) emit(t`${style.dim(result.reloadHint)}`);
    if (result.tip) emit(t`${style.dim(result.tip)}`);
    return true;
  }
  emitErr(t`${style.red(`No pude sacar el fondo en ${name}.`)}`);
  if (result.error) emitErr(t`${style.dim(result.error)}`);
  if (result.tip) emitErr(t`${style.dim(result.tip)}`);
  return false;
}

function reportAppleTerminalSet(result: ArtBackendResult, artPath: string) {
  if (result.ok) {
    emit(t`${style.green("✓")} ${
        result.successMessage ||
        "Fondo aplicado (perfil Terminal «Alquimia»)"
      }`);
    if (result.tip) emit(t`${style.dim(result.tip)}`);
    if (result.profile) {
      emit(t`${style.dim(`Perfil: ${result.profile}`)}`);
    }
    return true;
  }
  emitErr(t`${style.red("No pude setear el fondo en Terminal.app.")}`);
  if (result.error) emitErr(t`${style.dim(result.error)}`);
  if (result.tip) emitErr(t`${style.dim(result.tip)}`);
  else emitErr(t`${style.dim(appleTerminalManualTip(artPath))}`);
  emit(t`${style.dim(`Asset: ${artPath}`)}`);
  return false;
}

function reportAppleTerminalClear(result: ArtBackendResult) {
  if (result.ok) {
    emit(t`${style.green("✓")} ${
        result.successMessage || "Fondo sacado de Terminal.app."
      }`);
    if (result.tip) emit(t`${style.dim(result.tip)}`);
    return true;
  }
  emitErr(t`${style.red("No pude sacar el fondo en Terminal.app.")}`);
  if (result.error) emitErr(t`${style.dim(result.error)}`);
  if (result.tip) emitErr(t`${style.dim(result.tip)}`);
  return false;
}

/**
 * `alquimia art` entrypoint. Wraps the backend flow so every buffered status
 * line is painted once, on every exit path.
 * @param {Parameters<typeof runArtInner>[0]} [opts]
 */
export async function runArt(opts = {}) {
  try {
    return await runArtInner(opts);
  } finally {
    await flushReport();
  }
}
