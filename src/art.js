import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { platform } from "node:os";
import { fileURLToPath } from "node:url";
import { openUrl } from "./open-url.js";
import { style } from "./style.js";

const ART_FILENAME = "art.png";

/**
 * Absolute path to bundled brand art (works from source tree and global npm install).
 * @returns {string}
 */
export function getArtPath() {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "assets", ART_FILENAME);
}

/**
 * Detect terminal family for background-image support.
 * @returns {'iterm2'|'kitty'|'wezterm'|'unsupported'}
 */
export function detectTerminal() {
  const termProgram = String(process.env.TERM_PROGRAM || "");
  const term = String(process.env.TERM || "").toLowerCase();

  if (process.env.ITERM_SESSION_ID || termProgram === "iTerm.app") {
    return "iterm2";
  }

  if (process.env.KITTY_WINDOW_ID || term.includes("kitty")) {
    return "kitty";
  }

  if (
    process.env.WEZTERM_EXECUTABLE ||
    process.env.WEZTERM_PANE ||
    termProgram === "WezTerm" ||
    term.includes("wezterm")
  ) {
    return "wezterm";
  }

  return "unsupported";
}

/**
 * iTerm2 OSC 1337 SetBackgroundImageFile.
 * Clear uses an empty value (documented iTerm2 clear for this key).
 * @param {string|null} path absolute path, or null/empty to clear
 */
function writeItermBackground(path) {
  const payload = path ? Buffer.from(path, "utf8").toString("base64") : "";
  // ESC ] 1337 ; SetBackgroundImageFile=<base64|empty> BEL
  process.stdout.write(`\x1b]1337;SetBackgroundImageFile=${payload}\x07`);
}

/**
 * Run `kitty @ …` and capture stderr for remote-control tips.
 * @param {string[]} args
 * @returns {Promise<{ ok: boolean, stderr: string, code: number }>}
 */
function runKittyRemote(args) {
  return new Promise((resolve) => {
    const child = spawn("kitty", ["@", ...args], {
      stdio: ["ignore", "ignore", "pipe"],
      env: process.env,
    });

    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.once("error", (err) => {
      resolve({ ok: false, stderr: err.message, code: 1 });
    });

    child.once("close", (code) => {
      const exit = typeof code === "number" ? code : 1;
      resolve({ ok: exit === 0, stderr: stderr.trim(), code: exit });
    });
  });
}

/**
 * @param {string|null} path null clears; path sets background
 * @returns {Promise<{ ok: boolean, tip?: string }>}
 */
async function setKittyBackground(path) {
  const args = path
    ? ["set-background-image", path]
    : ["set-background-image", "none"];
  const result = await runKittyRemote(args);
  if (result.ok) return { ok: true };

  const tip =
    "Kitty necesita remote control. En kitty.conf: allow_remote_control yes " +
    "(o ask) y un listen_on / socket. Después: kitty @ set-background-image …";
  return { ok: false, tip };
}

/**
 * Open a local file with the OS default opener.
 * @param {string} path
 */
async function openFile(path) {
  const os = platform();
  if (os === "darwin") {
    return openUrl(path);
  }
  if (os === "win32") {
    return openUrl(path);
  }
  // Linux: xdg-open works for file paths too.
  return openUrl(path);
}

function printUnsupportedHelp({ clearing = false } = {}) {
  const action = clearing
    ? "No pude sacar el fondo desde esta terminal."
    : "Esta terminal no deja setear el fondo desde la CLI.";

  console.log(style.yellow(action));
  console.log(
    style.dim(
      "Funciona en iTerm2 (OSC 1337 SetBackgroundImageFile) y Kitty (kitty @ set-background-image)."
    )
  );
  console.log(
    style.dim(
      "Terminal.app / terminals genéricos no soportan esto. Probá iTerm2 o Kitty."
    )
  );
  console.log(
    style.dim(
      "Tip: alquimia art --open  ·  alquimia art --path  ·  alquimia art --clear"
    )
  );
}

function printWezTermTip({ clearing = false } = {}) {
  const action = clearing
    ? "WezTerm no tiene un clear de fondo runtime simple desde la CLI."
    : "WezTerm no tiene un set de fondo runtime simple desde la CLI.";
  console.log(style.yellow(action));
  console.log(
    style.dim(
      "Configurá background en wezterm.lua, o usá iTerm2 / Kitty. Tip: alquimia art --open / --path"
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
  const artPath = getArtPath();

  if (!existsSync(artPath)) {
    console.error(
      style.red(`No encuentro el asset: ${artPath}`)
    );
    process.exitCode = 1;
    return;
  }

  if (pathOnly) {
    console.log(artPath);
    return;
  }

  const terminal = detectTerminal();
  let backgroundOk = false;
  let didSomethingUseful = false;

  if (clear) {
    if (terminal === "iterm2") {
      // Empty SetBackgroundImageFile clears the session background image.
      writeItermBackground(null);
      backgroundOk = true;
      console.log(`${style.green("✓")} Fondo sacado.`);
    } else if (terminal === "kitty") {
      const result = await setKittyBackground(null);
      if (result.ok) {
        backgroundOk = true;
        console.log(`${style.green("✓")} Fondo sacado.`);
      } else {
        console.error(style.red("No pude sacar el fondo en Kitty."));
        if (result.tip) console.error(style.dim(result.tip));
      }
    } else if (terminal === "wezterm") {
      printWezTermTip({ clearing: true });
    } else {
      printUnsupportedHelp({ clearing: true });
    }

    didSomethingUseful = backgroundOk;
  } else {
    if (terminal === "iterm2") {
      writeItermBackground(artPath);
      backgroundOk = true;
      console.log(
        `${style.green("✓")} Fondo de terminal listo. Seguí usando la CLI encima.`
      );
    } else if (terminal === "kitty") {
      const result = await setKittyBackground(artPath);
      if (result.ok) {
        backgroundOk = true;
        console.log(
          `${style.green("✓")} Fondo de terminal listo. Seguí usando la CLI encima.`
        );
      } else {
        console.error(style.red("No pude setear el fondo en Kitty."));
        if (result.tip) console.error(style.dim(result.tip));
        console.log(style.dim(`Asset: ${artPath}`));
      }
    } else if (terminal === "wezterm") {
      printWezTermTip({ clearing: false });
      console.log(style.dim(`Asset: ${artPath}`));
    } else {
      printUnsupportedHelp({ clearing: false });
      console.log(style.dim(`Asset: ${artPath}`));
    }

    didSomethingUseful = backgroundOk;
  }

  if (open) {
    try {
      await openFile(artPath);
      console.log(
        `${style.green("✓")} Abriendo ${style.bold(ART_FILENAME)}…\n  ${style.dim(artPath)}`
      );
      didSomethingUseful = true;
    } catch (err) {
      console.error(style.red(`No pude abrir el archivo: ${err.message}`));
      console.error(style.dim(`Path: ${artPath}`));
    }
  }

  // Exit non-zero only if nothing useful could be done.
  if (!didSomethingUseful) {
    process.exitCode = 1;
  }
}
