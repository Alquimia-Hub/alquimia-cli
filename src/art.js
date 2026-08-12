import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openUrl } from "./open-url.js";
import { style } from "./style.js";
import { detectTerminal, SUPPORTED_TERMINALS } from "./art/detect.js";
import { ensurePersistedArt } from "./art/persist.js";
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
} from "./art/backends.js";
import {
  BLOCK_BEGIN,
  BLOCK_END,
  GHOSTTY_BLOCK_BEGIN,
  GHOSTTY_BLOCK_END,
  LEGACY_GHOSTTY_MARKER,
  patchConfigBlock,
  clearConfigBlock,
} from "./art/config-block.js";

const ART_FILENAME = "art.png";

export {
  detectTerminal,
  SUPPORTED_TERMINALS,
  ensurePersistedArt,
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
  BLOCK_BEGIN,
  BLOCK_END,
  GHOSTTY_BLOCK_BEGIN,
  GHOSTTY_BLOCK_END,
  LEGACY_GHOSTTY_MARKER,
  GHOSTTY_DEFAULT_OPACITY,
  patchConfigBlock,
  clearConfigBlock,
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
async function openFile(path) {
  return openUrl(path);
}

function supportedListLine() {
  return SUPPORTED_TERMINALS.map((t) => t.name).join(", ");
}

function printUnsupportedHelp(terminal, { clearing = false } = {}) {
  const labels = {
    alacritty:
      "Alacritty no tiene wallpaper nativo (solo forks). No inventamos claves de config.",
    konsole:
      "Konsole guarda el wallpaper en el color scheme; no lo tocamos (es invasivo).",
    "apple-terminal":
      "Terminal.app de Apple no permite setear fondo desde la CLI.",
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

  console.log(style.yellow(action));
  console.log(
    style.dim(
      `Soportados: ${supportedListLine()}.`
    )
  );
  console.log(
    style.dim(
      "No fingimos que funcionó. Tip: alquimia art --open  ·  --path  ·  --clear"
    )
  );
}

/**
 * @param {{
 *   clear?: boolean,
 *   open?: boolean,
 *   pathOnly?: boolean,
 * }} [opts]
 */
export async function runArt({
  clear = false,
  open = false,
  pathOnly = false,
} = {}) {
  const bundledPath = getArtPath();

  if (!existsSync(bundledPath)) {
    console.error(style.red(`No encuentro el asset: ${bundledPath}`));
    process.exitCode = 1;
    return;
  }

  if (pathOnly) {
    console.log(bundledPath);
    return;
  }

  // Persist so config-file terminals keep working after npm -g updates.
  let artPath = bundledPath;
  try {
    artPath = ensurePersistedArt(bundledPath);
  } catch {
    artPath = bundledPath;
  }

  const terminal = detectTerminal();
  let backgroundOk = false;
  let didSomethingUseful = false;

  if (clear) {
    backgroundOk = await clearForTerminal(terminal, artPath);
    didSomethingUseful = backgroundOk;
  } else {
    backgroundOk = await setForTerminal(terminal, artPath);
    didSomethingUseful = backgroundOk;
  }

  if (open) {
    try {
      await openFile(bundledPath);
      console.log(
        `${style.green("✓")} Abriendo ${style.bold(ART_FILENAME)}…\n  ${style.dim(bundledPath)}`
      );
      didSomethingUseful = true;
    } catch (err) {
      console.error(style.red(`No pude abrir el archivo: ${err.message}`));
      console.error(style.dim(`Path: ${bundledPath}`));
    }
  }

  if (!didSomethingUseful) {
    process.exitCode = 1;
  }
}

/**
 * @param {string} terminal
 * @param {string} artPath
 * @returns {Promise<boolean>}
 */
async function setForTerminal(terminal, artPath) {
  if (terminal === "iterm2") {
    writeItermBackground(artPath);
    console.log(
      `${style.green("✓")} Fondo de terminal listo (iTerm2 OSC). Seguí usando la CLI encima.`
    );
    return true;
  }

  if (terminal === "kitty") {
    const result = await setKittyBackground(artPath);
    if (result.ok) {
      console.log(
        `${style.green("✓")} Fondo de terminal listo (Kitty). Seguí usando la CLI encima.`
      );
      return true;
    }
    console.error(style.red("No pude setear el fondo en Kitty."));
    if (result.tip) console.error(style.dim(result.tip));
    console.log(style.dim(`Asset: ${artPath}`));
    return false;
  }

  if (terminal === "ghostty") {
    // Config write + reload only — Ghostty has no live OSC background path.
    return reportConfigResult(
      setGhosttyBackground(artPath),
      "Ghostty",
      artPath,
      {
        successExtra:
          "Se escribió la config (no es OSC en vivo). Recargá Ghostty para ver el fondo.",
      }
    );
  }

  if (terminal === "wezterm") {
    return reportConfigResult(
      setWeztermBackground(artPath),
      "WezTerm",
      artPath
    );
  }

  if (terminal === "contour") {
    return reportConfigResult(
      setContourBackground(artPath),
      "Contour",
      artPath
    );
  }

  if (terminal === "hyper") {
    return reportConfigResult(setHyperBackground(artPath), "Hyper", artPath);
  }

  if (terminal === "tabby") {
    return reportConfigResult(setTabbyBackground(artPath), "Tabby", artPath);
  }

  if (terminal === "windows-terminal") {
    return reportConfigResult(
      setWindowsTerminalBackground(artPath),
      "Windows Terminal",
      artPath
    );
  }

  if (terminal === "tilix") {
    const result = setTilixBackground(artPath);
    if (result.ok) {
      console.log(`${style.green("✓")} Fondo setado en Tilix (gsettings).`);
      if (result.tip) console.log(style.dim(result.tip));
      return true;
    }
    console.error(style.red("No pude setear el fondo en Tilix."));
    if (result.error) console.error(style.dim(result.error));
    console.log(style.dim(`Asset: ${artPath}`));
    return false;
  }

  if (terminal === "terminology") {
    const result = setTerminologyBackground(artPath);
    if (result.ok) {
      console.log(`${style.green("✓")} Fondo setado en Terminology (tybg).`);
      return true;
    }
    console.error(style.red("No pude setear el fondo en Terminology."));
    if (result.error) console.error(style.dim(result.error));
    console.log(style.dim(`Asset: ${artPath}`));
    return false;
  }

  printUnsupportedHelp(terminal, { clearing: false });
  console.log(style.dim(`Asset: ${artPath}`));
  return false;
}

/**
 * @param {string} terminal
 * @param {string} artPath
 * @returns {Promise<boolean>}
 */
async function clearForTerminal(terminal, artPath) {
  if (terminal === "iterm2") {
    writeItermBackground(null);
    console.log(`${style.green("✓")} Fondo sacado (iTerm2).`);
    return true;
  }

  if (terminal === "kitty") {
    const result = await setKittyBackground(null);
    if (result.ok) {
      console.log(`${style.green("✓")} Fondo sacado (Kitty).`);
      return true;
    }
    console.error(style.red("No pude sacar el fondo en Kitty."));
    if (result.tip) console.error(style.dim(result.tip));
    return false;
  }

  if (terminal === "ghostty") {
    return reportClearResult(clearGhosttyBackground(), "Ghostty");
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
      console.log(`${style.green("✓")} Fondo sacado en Tilix.`);
      return true;
    }
    console.error(style.red("No pude sacar el fondo en Tilix."));
    if (result.error) console.error(style.dim(result.error));
    return false;
  }

  if (terminal === "terminology") {
    const result = clearTerminologyBackground();
    if (result.ok) {
      console.log(`${style.green("✓")} Fondo sacado en Terminology.`);
      return true;
    }
    console.error(style.red("No pude sacar el fondo en Terminology."));
    if (result.error) console.error(style.dim(result.error));
    return false;
  }

  printUnsupportedHelp(terminal, { clearing: true });
  return false;
}

function reportConfigResult(result, name, artPath, { successExtra } = {}) {
  if (result.ok) {
    console.log(
      `${style.green("✓")} Fondo escrito para ${name} (no es universal en todas las terminales).`
    );
    if (successExtra) console.log(style.dim(successExtra));
    if (result.configPath) console.log(style.dim(`Config: ${result.configPath}`));
    if (result.reloadHint) console.log(style.dim(result.reloadHint));
    if (result.tip) console.log(style.dim(result.tip));
    return true;
  }
  console.error(style.red(`No pude setear el fondo en ${name}.`));
  if (result.error) console.error(style.dim(result.error));
  console.log(style.dim(`Asset: ${artPath}`));
  return false;
}

function reportClearResult(result, name) {
  if (result.ok) {
    if (result.changed === false) {
      console.log(
        `${style.green("✓")} No había líneas de alquimia art en ${name}.`
      );
    } else {
      console.log(`${style.green("✓")} Fondo sacado de ${name}.`);
      if (result.configPath) {
        console.log(style.dim(`Config: ${result.configPath}`));
      }
      if (result.reloadHint) console.log(style.dim(result.reloadHint));
    }
    return true;
  }
  console.error(style.red(`No pude sacar el fondo en ${name}.`));
  if (result.error) console.error(style.dim(result.error));
  return false;
}
