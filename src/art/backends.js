import {
  existsSync as fsExistsSync,
  readFileSync as fsReadFileSync,
  copyFileSync as fsCopyFileSync,
  mkdirSync as fsMkdirSync,
} from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import {
  BLOCK_BEGIN,
  BLOCK_END,
  LUA_BLOCK_BEGIN,
  LUA_BLOCK_END,
  JS_BLOCK_BEGIN,
  JS_BLOCK_END,
  CSS_BLOCK_BEGIN,
  CSS_BLOCK_END,
  atomicWriteFile,
  clearConfigBlock,
  clearLegacyGhosttyMarkers,
  patchConfigBlock,
  patchConfigBlockAfter,
} from "./config-block.js";

const GHOSTTY_OPACITY = 0.25;
const WEZTERM_BRIGHTNESS = 0.25;
const CONTOUR_OPACITY = 0.25;
const WT_OPACITY = 0.25;

// ── Ghostty ──────────────────────────────────────────────────────────

/**
 * @param {{
 *   home?: string,
 *   platform?: string,
 *   xdgConfigHome?: string | null,
 * }} [opts]
 * @returns {string[]}
 */
export function ghosttyConfigCandidates({
  home = homedir(),
  platform: osPlatform = platform(),
  xdgConfigHome = process.env.XDG_CONFIG_HOME,
} = {}) {
  const xdgRoot =
    xdgConfigHome && String(xdgConfigHome).trim()
      ? String(xdgConfigHome)
      : join(home, ".config");

  const paths = [
    join(xdgRoot, "ghostty", "config.ghostty"),
    join(xdgRoot, "ghostty", "config"),
  ];

  if (osPlatform === "darwin") {
    paths.push(
      join(
        home,
        "Library",
        "Application Support",
        "com.mitchellh.ghostty",
        "config.ghostty"
      ),
      join(
        home,
        "Library",
        "Application Support",
        "com.mitchellh.ghostty",
        "config"
      ),
      join(home, "Library", "Application Support", "Ghostty", "config")
    );
  }

  return paths;
}

/**
 * @param {object} [opts]
 * @returns {string}
 */
export function resolveGhosttyConfigPath(opts = {}) {
  const exists = opts.existsSync ?? fsExistsSync;
  const read = opts.readFileSync ?? fsReadFileSync;
  const candidates = ghosttyConfigCandidates(opts);

  for (const p of candidates) {
    if (!exists(p)) continue;
    try {
      const text = read(p, "utf8");
      if (text.includes(BLOCK_BEGIN) || text.includes("# alquimia-art")) {
        return p;
      }
    } catch {
      /* ignore */
    }
  }

  const existing = candidates.filter((p) => exists(p));
  if (existing.length > 0) return existing[existing.length - 1];

  const xdgRoot =
    opts.xdgConfigHome && String(opts.xdgConfigHome).trim()
      ? String(opts.xdgConfigHome)
      : join(opts.home ?? homedir(), ".config");
  return join(xdgRoot, "ghostty", "config");
}

/**
 * @param {string} content
 * @param {string} imagePath
 * @param {{ opacity?: number }} [opts]
 * @returns {string}
 */
export function patchGhosttyConfigContent(
  content,
  imagePath,
  { opacity = GHOSTTY_OPACITY } = {}
) {
  let base = clearLegacyGhosttyMarkers(content == null ? "" : String(content));
  base = clearConfigBlock(base, BLOCK_BEGIN, BLOCK_END);
  return patchConfigBlock(base, BLOCK_BEGIN, BLOCK_END, [
    `background-image = ${imagePath}`,
    `background-image-opacity = ${opacity}`,
    "background-image-fit = contain",
    "background-image-position = center",
  ]);
}

/**
 * @param {string} content
 * @returns {string}
 */
export function clearGhosttyArtFromConfig(content) {
  let base = clearLegacyGhosttyMarkers(content == null ? "" : String(content));
  return clearConfigBlock(base, BLOCK_BEGIN, BLOCK_END);
}

export function ghosttyReloadHint(osPlatform = platform()) {
  if (osPlatform === "darwin") {
    return "Recargá Ghostty: ⌘⇧, (cmd+shift+,) o reiniciá la app.";
  }
  return "Recargá Ghostty: Ctrl+Shift+, o reiniciá la app.";
}

/**
 * @param {string} imagePath
 * @param {object} [opts]
 */
export function setGhosttyBackground(imagePath, opts = {}) {
  const exists = opts.existsSync ?? fsExistsSync;
  const read = opts.readFileSync ?? fsReadFileSync;
  const configPath = resolveGhosttyConfigPath(opts);
  try {
    const previous = exists(configPath) ? read(configPath, "utf8") : "";
    const next = patchGhosttyConfigContent(previous, imagePath, {
      opacity: opts.opacity ?? GHOSTTY_OPACITY,
    });
    atomicWriteFile(configPath, next, opts);
    return {
      ok: true,
      configPath,
      needsReload: true,
      reloadHint: ghosttyReloadHint(opts.platform ?? platform()),
    };
  } catch (err) {
    return {
      ok: false,
      configPath,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * @param {object} [opts]
 */
export function clearGhosttyBackground(opts = {}) {
  const exists = opts.existsSync ?? fsExistsSync;
  const read = opts.readFileSync ?? fsReadFileSync;
  const candidates = ghosttyConfigCandidates(opts);
  const targets = candidates.filter((p) => {
    if (!exists(p)) return false;
    try {
      const t = read(p, "utf8");
      return t.includes(BLOCK_BEGIN) || t.includes("# alquimia-art");
    } catch {
      return false;
    }
  });

  if (targets.length === 0) {
    return {
      ok: true,
      configPath: candidates.find((p) => exists(p)) || null,
      changed: false,
      needsReload: false,
    };
  }

  try {
    let changed = false;
    let last = targets[0];
    for (const configPath of targets) {
      last = configPath;
      const previous = read(configPath, "utf8");
      const next = clearGhosttyArtFromConfig(previous);
      if (next !== previous) {
        atomicWriteFile(configPath, next, opts);
        changed = true;
      }
    }
    return {
      ok: true,
      configPath: last,
      changed,
      needsReload: changed,
      reloadHint: changed
        ? ghosttyReloadHint(opts.platform ?? platform())
        : undefined,
    };
  } catch (err) {
    return {
      ok: false,
      configPath: targets[0] || null,
      changed: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── WezTerm ──────────────────────────────────────────────────────────

/**
 * @param {object} [opts]
 * @returns {string[]}
 */
export function weztermConfigCandidates({
  home = homedir(),
  xdgConfigHome = process.env.XDG_CONFIG_HOME,
} = {}) {
  const xdgRoot =
    xdgConfigHome && String(xdgConfigHome).trim()
      ? String(xdgConfigHome)
      : join(home, ".config");
  return [
    join(home, ".wezterm.lua"),
    join(xdgRoot, "wezterm", "wezterm.lua"),
  ];
}

/**
 * @param {object} [opts]
 * @returns {string}
 */
export function resolveWeztermConfigPath(opts = {}) {
  const exists = opts.existsSync ?? fsExistsSync;
  const read = opts.readFileSync ?? fsReadFileSync;
  const candidates = weztermConfigCandidates(opts);
  for (const p of candidates) {
    if (!exists(p)) continue;
    try {
      if (read(p, "utf8").includes(LUA_BLOCK_BEGIN)) return p;
    } catch {
      /* ignore */
    }
  }
  const existing = candidates.find((p) => exists(p));
  if (existing) return existing;
  return candidates[0];
}

/**
 * Pure WezTerm Lua patch. Uses `config.*` (config_builder style).
 * @param {string} content
 * @param {string} imagePath
 * @param {{ brightness?: number }} [opts]
 * @returns {string}
 */
export function patchWeztermConfigContent(
  content,
  imagePath,
  { brightness = WEZTERM_BRIGHTNESS } = {}
) {
  const body = [
    `-- Managed by alquimia art. Requires a \`config\` table (wezterm.config_builder()).`,
    `if config then`,
    `  config.window_background_image = ${luaString(imagePath)}`,
    `  config.window_background_image_hsb = { brightness = ${brightness}, hue = 1.0, saturation = 1.0 }`,
    `end`,
  ];

  let base = content == null ? "" : String(content);
  if (!base.trim()) {
    base = [
      "local wezterm = require 'wezterm'",
      "local config = wezterm.config_builder()",
      "",
      LUA_BLOCK_BEGIN,
      ...body,
      LUA_BLOCK_END,
      "",
      "return config",
      "",
    ].join("\n");
    return base;
  }

  return patchConfigBlock(base, LUA_BLOCK_BEGIN, LUA_BLOCK_END, body);
}

/**
 * @param {string} content
 * @returns {string}
 */
export function clearWeztermArtFromConfig(content) {
  return clearConfigBlock(content, LUA_BLOCK_BEGIN, LUA_BLOCK_END);
}

export function weztermReloadHint() {
  return "WezTerm suele auto-reload; si no: Ctrl+Shift+R.";
}

/**
 * @param {string} imagePath
 * @param {object} [opts]
 */
export function setWeztermBackground(imagePath, opts = {}) {
  const exists = opts.existsSync ?? fsExistsSync;
  const read = opts.readFileSync ?? fsReadFileSync;
  const configPath = resolveWeztermConfigPath(opts);
  try {
    const previous = exists(configPath) ? read(configPath, "utf8") : "";
    const next = patchWeztermConfigContent(previous, imagePath, {
      brightness: opts.brightness ?? WEZTERM_BRIGHTNESS,
    });
    atomicWriteFile(configPath, next, opts);
    return {
      ok: true,
      configPath,
      needsReload: true,
      reloadHint: weztermReloadHint(),
    };
  } catch (err) {
    return {
      ok: false,
      configPath,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * @param {object} [opts]
 */
export function clearWeztermBackground(opts = {}) {
  const exists = opts.existsSync ?? fsExistsSync;
  const read = opts.readFileSync ?? fsReadFileSync;
  const candidates = weztermConfigCandidates(opts);
  const targets = candidates.filter((p) => {
    if (!exists(p)) return false;
    try {
      return read(p, "utf8").includes(LUA_BLOCK_BEGIN);
    } catch {
      return false;
    }
  });
  if (targets.length === 0) {
    return { ok: true, configPath: null, changed: false, needsReload: false };
  }
  try {
    let changed = false;
    let last = targets[0];
    for (const p of targets) {
      last = p;
      const prev = read(p, "utf8");
      const next = clearWeztermArtFromConfig(prev);
      if (next !== prev) {
        atomicWriteFile(p, next, opts);
        changed = true;
      }
    }
    return {
      ok: true,
      configPath: last,
      changed,
      needsReload: changed,
      reloadHint: changed ? weztermReloadHint() : undefined,
    };
  } catch (err) {
    return {
      ok: false,
      configPath: targets[0],
      changed: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function luaString(s) {
  return `'${String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

// ── Contour ──────────────────────────────────────────────────────────

/**
 * @param {object} [opts]
 * @returns {string[]}
 */
export function contourConfigCandidates({
  home = homedir(),
  xdgConfigHome = process.env.XDG_CONFIG_HOME,
} = {}) {
  const xdgRoot =
    xdgConfigHome && String(xdgConfigHome).trim()
      ? String(xdgConfigHome)
      : join(home, ".config");
  return [
    join(xdgRoot, "contour", "contour.yml"),
    join(xdgRoot, "contour", "contour.yaml"),
  ];
}

/**
 * @param {object} [opts]
 * @returns {string}
 */
export function resolveContourConfigPath(opts = {}) {
  const exists = opts.existsSync ?? fsExistsSync;
  const read = opts.readFileSync ?? fsReadFileSync;
  const candidates = contourConfigCandidates(opts);
  for (const p of candidates) {
    if (!exists(p)) continue;
    try {
      if (read(p, "utf8").includes(BLOCK_BEGIN)) return p;
    } catch {
      /* ignore */
    }
  }
  const existing = candidates.find((p) => exists(p));
  if (existing) return existing;
  return candidates[0];
}

/**
 * Insert background_image under color_schemes.default when possible.
 * @param {string} content
 * @param {string} imagePath
 * @param {{ opacity?: number }} [opts]
 * @returns {string}
 */
export function patchContourConfigContent(
  content,
  imagePath,
  { opacity = CONTOUR_OPACITY } = {}
) {
  const body = [
    "    background_image:",
    `      path: '${escapeYamlSingle(imagePath)}'`,
    `      opacity: ${opacity}`,
    "      blur: false",
  ];

  let base = clearConfigBlock(
    content == null ? "" : String(content),
    BLOCK_BEGIN,
    BLOCK_END
  );

  if (!base.trim()) {
    return [
      "color_schemes:",
      "  default:",
      BLOCK_BEGIN,
      ...body,
      BLOCK_END,
      "",
    ].join("\n");
  }

  // Prefer inserting right after `default:` under color_schemes.
  const defaultLine = /^\s*default:\s*$/;
  if (base.split(/\r?\n/).some((l) => defaultLine.test(l))) {
    return patchConfigBlockAfter(
      base,
      defaultLine,
      BLOCK_BEGIN,
      BLOCK_END,
      body
    );
  }

  // Fallback: append a default scheme fragment (may need merge by Contour).
  return patchConfigBlock(base, BLOCK_BEGIN, BLOCK_END, [
    "color_schemes:",
    "  default:",
    ...body,
  ]);
}

/**
 * @param {string} content
 * @returns {string}
 */
export function clearContourArtFromConfig(content) {
  return clearConfigBlock(content, BLOCK_BEGIN, BLOCK_END);
}

export function contourReloadHint() {
  return "Reiniciá Contour para aplicar el fondo (o reabrí la ventana).";
}

/**
 * @param {string} imagePath
 * @param {object} [opts]
 */
export function setContourBackground(imagePath, opts = {}) {
  const exists = opts.existsSync ?? fsExistsSync;
  const read = opts.readFileSync ?? fsReadFileSync;
  const configPath = resolveContourConfigPath(opts);
  try {
    const previous = exists(configPath) ? read(configPath, "utf8") : "";
    const next = patchContourConfigContent(previous, imagePath, {
      opacity: opts.opacity ?? CONTOUR_OPACITY,
    });
    atomicWriteFile(configPath, next, opts);
    return {
      ok: true,
      configPath,
      needsReload: true,
      reloadHint: contourReloadHint(),
    };
  } catch (err) {
    return {
      ok: false,
      configPath,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * @param {object} [opts]
 */
export function clearContourBackground(opts = {}) {
  return clearMarkedConfigs({
    candidates: contourConfigCandidates(opts),
    clearFn: clearContourArtFromConfig,
    reloadHint: contourReloadHint(),
    opts,
  });
}

function escapeYamlSingle(s) {
  return String(s).replace(/'/g, "''");
}

// ── Hyper ────────────────────────────────────────────────────────────

/**
 * @param {object} [opts]
 * @returns {string[]}
 */
export function hyperConfigCandidates({
  home = homedir(),
  platform: osPlatform = platform(),
  xdgConfigHome = process.env.XDG_CONFIG_HOME,
} = {}) {
  const xdgRoot =
    xdgConfigHome && String(xdgConfigHome).trim()
      ? String(xdgConfigHome)
      : join(home, ".config");
  const paths = [join(home, ".hyper.js")];
  if (osPlatform === "darwin") {
    paths.unshift(
      join(home, "Library", "Application Support", "Hyper", ".hyper.js")
    );
  } else if (osPlatform === "win32") {
    const appData = process.env.APPDATA || join(home, "AppData", "Roaming");
    paths.unshift(join(appData, "Hyper", ".hyper.js"));
  } else {
    paths.unshift(join(xdgRoot, "Hyper", ".hyper.js"));
  }
  return paths;
}

/**
 * @param {object} [opts]
 * @returns {string}
 */
export function resolveHyperConfigPath(opts = {}) {
  const exists = opts.existsSync ?? fsExistsSync;
  const read = opts.readFileSync ?? fsReadFileSync;
  const candidates = hyperConfigCandidates(opts);
  for (const p of candidates) {
    if (!exists(p)) continue;
    try {
      const t = read(p, "utf8");
      if (t.includes(JS_BLOCK_BEGIN) || t.includes(CSS_BLOCK_BEGIN)) return p;
    } catch {
      /* ignore */
    }
  }
  return candidates.find((p) => exists(p)) || candidates[0];
}

/**
 * Inject CSS background into Hyper .hyper.js (marked block).
 * @param {string} content
 * @param {string} imagePath
 * @returns {string}
 */
export function patchHyperConfigContent(content, imagePath) {
  const fileUrl = pathToFileUrl(imagePath);
  const cssBody = [
    CSS_BLOCK_BEGIN,
    `.terms_terms { background: url(${fileUrl}) center / cover no-repeat; }`,
    `.terms_termGroup { background: rgba(0,0,0,0.55) !important; }`,
    CSS_BLOCK_END,
  ];

  let base = content == null ? "" : String(content);
  // Strip previous JS and CSS marked blocks.
  base = clearConfigBlock(base, JS_BLOCK_BEGIN, JS_BLOCK_END);
  base = clearConfigBlock(base, CSS_BLOCK_BEGIN, CSS_BLOCK_END);

  if (!base.trim()) {
    return [
      "module.exports = {",
      "  config: {",
      JS_BLOCK_BEGIN,
      "    css: `",
      ...cssBody.map((l) => `      ${l}`),
      "    `,",
      JS_BLOCK_END,
      "  },",
      "};",
      "",
    ].join("\n");
  }

  // Prefer injecting into an existing css: `...` template if present.
  const cssMatch = base.match(/css\s*:\s*`([\s\S]*?)`/);
  if (cssMatch) {
    const injected = `${cssMatch[1].replace(/\s+$/, "")}\n${cssBody.join("\n")}\n`;
    return base.replace(cssMatch[0], `css: \`${injected}\``);
  }

  return patchConfigBlock(base, JS_BLOCK_BEGIN, JS_BLOCK_END, [
    "/* Paste into config.css if auto-inject failed: */",
    ...cssBody,
  ]);
}

/**
 * @param {string} content
 * @returns {string}
 */
export function clearHyperArtFromConfig(content) {
  let base = clearConfigBlock(content, JS_BLOCK_BEGIN, JS_BLOCK_END);
  base = clearConfigBlock(base, CSS_BLOCK_BEGIN, CSS_BLOCK_END);
  return base;
}

export function hyperReloadHint() {
  return "Hyper recarga .hyper.js solo; si no ves el fondo, reiniciá Hyper.";
}

/**
 * @param {string} imagePath
 * @param {object} [opts]
 */
export function setHyperBackground(imagePath, opts = {}) {
  const exists = opts.existsSync ?? fsExistsSync;
  const read = opts.readFileSync ?? fsReadFileSync;
  const configPath = resolveHyperConfigPath(opts);
  try {
    const previous = exists(configPath) ? read(configPath, "utf8") : "";
    const next = patchHyperConfigContent(previous, imagePath);
    atomicWriteFile(configPath, next, opts);
    return {
      ok: true,
      configPath,
      needsReload: true,
      reloadHint: hyperReloadHint(),
    };
  } catch (err) {
    return {
      ok: false,
      configPath,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * @param {object} [opts]
 */
export function clearHyperBackground(opts = {}) {
  return clearMarkedConfigs({
    candidates: hyperConfigCandidates(opts),
    clearFn: clearHyperArtFromConfig,
    reloadHint: hyperReloadHint(),
    marker: CSS_BLOCK_BEGIN,
    altMarker: JS_BLOCK_BEGIN,
    opts,
  });
}

function pathToFileUrl(absPath) {
  const normalized = String(absPath).replace(/\\/g, "/");
  if (/^[A-Za-z]:\//.test(normalized)) {
    return `file:///${normalized}`;
  }
  return `file://${normalized}`;
}

// ── Tabby ────────────────────────────────────────────────────────────

/**
 * @param {object} [opts]
 * @returns {string[]}
 */
export function tabbyConfigCandidates({
  home = homedir(),
  platform: osPlatform = platform(),
  xdgConfigHome = process.env.XDG_CONFIG_HOME,
  env = process.env,
} = {}) {
  if (env.TABBY_CONFIG_DIRECTORY) {
    return [join(String(env.TABBY_CONFIG_DIRECTORY), "config.yaml")];
  }
  const xdgRoot =
    xdgConfigHome && String(xdgConfigHome).trim()
      ? String(xdgConfigHome)
      : join(home, ".config");
  if (osPlatform === "darwin") {
    return [
      join(home, "Library", "Application Support", "tabby", "config.yaml"),
    ];
  }
  if (osPlatform === "win32") {
    const appData = env.APPDATA || join(home, "AppData", "Roaming");
    return [join(appData, "tabby", "config.yaml")];
  }
  return [join(xdgRoot, "tabby", "config.yaml")];
}

/**
 * Patch Tabby appearance.css with marked CSS (YAML scalar).
 * @param {string} content
 * @param {string} imagePath
 * @returns {string}
 */
export function patchTabbyConfigContent(content, imagePath) {
  const fileUrl = pathToFileUrl(imagePath);
  const css = [
    CSS_BLOCK_BEGIN,
    `.xterm-viewport { background-image: url("${fileUrl}"); background-repeat: no-repeat; background-size: cover; opacity: 0.25; z-index: 1; }`,
    CSS_BLOCK_END,
  ].join(" ");

  let base = content == null ? "" : String(content);
  // Remove previous marked CSS occurrences inside the file.
  base = base.replace(
    new RegExp(
      `${escapeRegExp(CSS_BLOCK_BEGIN)}[\\s\\S]*?${escapeRegExp(CSS_BLOCK_END)}`,
      "g"
    ),
    ""
  );

  // appearance.css: '...'
  const cssKey = /(appearance:\s*\n(?:[ \t]+[^\n]*\n)*?[ \t]+css:\s*)(['"])([\s\S]*?)\2/;
  const m = base.match(cssKey);
  if (m) {
    const quote = m[2];
    const prev = String(m[3]).replace(/\s+$/, "");
    const nextCss = `${prev} ${css}`.replace(/^\s+/, "");
    return base.replace(m[0], `${m[1]}${quote}${nextCss}${quote}`);
  }

  // No css key — append a minimal appearance block with markers as YAML comments.
  if (!base.trim()) {
    return [
      "appearance:",
      `  css: '${css.replace(/'/g, "''")}'`,
      "",
    ].join("\n");
  }

  if (/^appearance:\s*$/m.test(base)) {
    return base.replace(
      /^appearance:\s*$/m,
      `appearance:\n  css: '${css.replace(/'/g, "''")}'`
    );
  }

  return `${base.replace(/\n+$/, "\n")}\nappearance:\n  css: '${css.replace(/'/g, "''")}'\n`;
}

/**
 * @param {string} content
 * @returns {string}
 */
export function clearTabbyArtFromConfig(content) {
  const text = content == null ? "" : String(content);
  return text
    .replace(
      new RegExp(
        `\\s*${escapeRegExp(CSS_BLOCK_BEGIN)}[\\s\\S]*?${escapeRegExp(CSS_BLOCK_END)}`,
        "g"
      ),
      ""
    )
    .replace(/[ \t]+css:\s*['"]\s*['"]\n?/g, "");
}

export function tabbyReloadHint() {
  return "Reiniciá Tabby (o togglear Custom CSS) para ver el fondo. Activá Acrylic si no se ve.";
}

/**
 * @param {string} imagePath
 * @param {object} [opts]
 */
export function setTabbyBackground(imagePath, opts = {}) {
  const exists = opts.existsSync ?? fsExistsSync;
  const read = opts.readFileSync ?? fsReadFileSync;
  const candidates = tabbyConfigCandidates(opts);
  const configPath = candidates.find((p) => exists(p)) || candidates[0];
  try {
    const previous = exists(configPath) ? read(configPath, "utf8") : "";
    const next = patchTabbyConfigContent(previous, imagePath);
    atomicWriteFile(configPath, next, opts);
    return {
      ok: true,
      configPath,
      needsReload: true,
      reloadHint: tabbyReloadHint(),
    };
  } catch (err) {
    return {
      ok: false,
      configPath,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * @param {object} [opts]
 */
export function clearTabbyBackground(opts = {}) {
  return clearMarkedConfigs({
    candidates: tabbyConfigCandidates(opts),
    clearFn: clearTabbyArtFromConfig,
    reloadHint: tabbyReloadHint(),
    marker: CSS_BLOCK_BEGIN,
    opts,
  });
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Windows Terminal ─────────────────────────────────────────────────

/**
 * Discover settings.json candidates (Windows + WSL).
 * @param {object} [opts]
 * @returns {string[]}
 */
export function windowsTerminalSettingsCandidates({
  home = homedir(),
  env = process.env,
  platform: osPlatform = platform(),
  existsSync: exists = fsExistsSync,
} = {}) {
  const paths = [];

  if (osPlatform === "win32") {
    const local = env.LOCALAPPDATA || join(home, "AppData", "Local");
    paths.push(
      join(
        local,
        "Packages",
        "Microsoft.WindowsTerminal_8wekyb3d8bbwe",
        "LocalState",
        "settings.json"
      ),
      join(local, "Microsoft", "Windows Terminal", "settings.json")
    );
  }

  // WSL: look under /mnt/c/Users/*/AppData/...
  const wslUsers = join("/mnt/c/Users");
  if (exists(wslUsers) || env.WSL_DISTRO_NAME || env.WT_SESSION) {
    // Prefer USERNAME / Windows user from env when present.
    const winUser = env.WINDOWS_USER || env.WSL_USER || env.USERNAME;
    const userDirs = winUser
      ? [join(wslUsers, winUser)]
      : [];
    // Also scan a shallow list if needed (bounded).
    if (userDirs.length === 0 && exists(wslUsers)) {
      try {
        // Lazy: only try common env-derived path; avoid full scan in lib.
        const fromHome = env.USERPROFILE;
        if (fromHome && /^[A-Za-z]:\\/.test(fromHome)) {
          const name = fromHome.split("\\").pop();
          if (name) userDirs.push(join(wslUsers, name));
        }
      } catch {
        /* ignore */
      }
    }
    for (const ud of userDirs) {
      paths.push(
        join(
          ud,
          "AppData",
          "Local",
          "Packages",
          "Microsoft.WindowsTerminal_8wekyb3d8bbwe",
          "LocalState",
          "settings.json"
        ),
        join(ud, "AppData", "Local", "Microsoft", "Windows Terminal", "settings.json")
      );
    }
  }

  return paths;
}

/**
 * Pure JSONC-tolerant patch of profiles.defaults backgroundImage*.
 * @param {string} content
 * @param {string} imagePathWindows Windows-style or ms-appdata path
 * @param {{ opacity?: number }} [opts]
 * @returns {string}
 */
export function patchWindowsTerminalSettings(
  content,
  imagePathWindows,
  { opacity = WT_OPACITY } = {}
) {
  let text = content == null ? "" : String(content);
  if (!text.trim()) {
    return JSON.stringify(
      {
        profiles: {
          defaults: {
            backgroundImage: imagePathWindows,
            backgroundImageOpacity: opacity,
            backgroundImageStretchMode: "uniformToFill",
          },
          list: [],
        },
      },
      null,
      4
    ) + "\n";
  }

  // Strip previous alquimia marker comments if any.
  text = text.replace(
    /\/\*\s*>>> alquimia-art >>>\s*\*\/[\s\S]*?\/\*\s*<<< alquimia-art <<<\s*\*\//g,
    ""
  );

  const defaultsMatch = text.match(
    /("defaults"\s*:\s*)\{([\s\S]*?)\}(\s*,\s*"list"|\s*\})/
  );
  if (defaultsMatch) {
    let body = defaultsMatch[2];
    body = body
      .replace(/,?\s*"backgroundImage"\s*:\s*"[^"]*"/g, "")
      .replace(/,?\s*"backgroundImageOpacity"\s*:\s*[0-9.]+/g, "")
      .replace(/,?\s*"backgroundImageStretchMode"\s*:\s*"[^"]*"/g, "");
    body = body.replace(/,(\s*)$/m, "$1").trim();
    const insert = [
      `"backgroundImage": ${JSON.stringify(imagePathWindows)}`,
      `"backgroundImageOpacity": ${opacity}`,
      `"backgroundImageStretchMode": "uniformToFill"`,
    ].join(",\n            ");
    const newBody = body
      ? `${body.replace(/\s*$/, "")},\n            ${insert}\n        `
      : `\n            ${insert}\n        `;
    return text.replace(
      defaultsMatch[0],
      `${defaultsMatch[1]}{${newBody}}${defaultsMatch[3]}`
    );
  }

  // Fallback: prepend defaults via fragile append note — try profiles key.
  if (/"profiles"\s*:\s*\{/.test(text)) {
    return text.replace(
      /("profiles"\s*:\s*\{)/,
      `$1\n        "defaults": {\n            "backgroundImage": ${JSON.stringify(
        imagePathWindows
      )},\n            "backgroundImageOpacity": ${opacity},\n            "backgroundImageStretchMode": "uniformToFill"\n        },`
    );
  }

  return text;
}

/**
 * @param {string} content
 * @returns {string}
 */
export function clearWindowsTerminalSettings(content) {
  let text = content == null ? "" : String(content);
  text = text.replace(
    /\/\*\s*>>> alquimia-art >>>\s*\*\/[\s\S]*?\/\*\s*<<< alquimia-art <<<\s*\*\//g,
    ""
  );
  const defaultsMatch = text.match(
    /("defaults"\s*:\s*)\{([\s\S]*?)\}(\s*,\s*"list"|\s*\})/
  );
  if (!defaultsMatch) return text;
  let body = defaultsMatch[2];
  body = body
    .replace(/,?\s*"backgroundImage"\s*:\s*"[^"]*"/g, "")
    .replace(/,?\s*"backgroundImageOpacity"\s*:\s*[0-9.]+/g, "")
    .replace(/,?\s*"backgroundImageStretchMode"\s*:\s*"[^"]*"/g, "");
  body = body.replace(/,\s*,/g, ",").replace(/^\s*,/, "").replace(/,\s*$/, "");
  return text.replace(
    defaultsMatch[0],
    `${defaultsMatch[1]}{${body}}${defaultsMatch[3]}`
  );
}

/**
 * Convert a WSL path to a Windows path when under /mnt/<drive>/...
 * @param {string} absPath
 * @returns {string}
 */
export function toWindowsPathIfWsl(absPath) {
  const m = String(absPath).match(/^\/mnt\/([a-z])\/(.*)$/i);
  if (!m) return absPath;
  const drive = m[1].toUpperCase();
  const rest = m[2].replace(/\//g, "\\");
  return `${drive}:\\${rest}`;
}

export function windowsTerminalReloadHint() {
  return "Windows Terminal aplica backgroundImage al guardar settings; abrí Settings o reiniciá la pestaña si no se ve.";
}

/**
 * @param {string} imagePath
 * @param {object} [opts]
 */
export function setWindowsTerminalBackground(imagePath, opts = {}) {
  const exists = opts.existsSync ?? fsExistsSync;
  const read = opts.readFileSync ?? fsReadFileSync;
  const copy = opts.copyFileSync ?? fsCopyFileSync;
  const mkdir = opts.mkdirSync ?? fsMkdirSync;
  const candidates = windowsTerminalSettingsCandidates(opts);
  const configPath = candidates.find((p) => exists(p));
  if (!configPath) {
    return {
      ok: false,
      configPath: null,
      error:
        "No encontré settings.json de Windows Terminal (¿WSL sin /mnt/c/Users/<vos>/…?).",
    };
  }

  try {
    // Prefer copying art next to settings so WT can read it on Windows.
    let wtImage = toWindowsPathIfWsl(imagePath);
    const localStateDir = dirname(configPath);
    if (exists(localStateDir)) {
      const dest = join(localStateDir, "alquimia-art.png");
      try {
        copy(imagePath, dest);
        wtImage = toWindowsPathIfWsl(dest);
        // For package LocalState, ms-appdata works too when under package folder.
        if (/Microsoft\.WindowsTerminal.*LocalState/.test(configPath)) {
          wtImage = "ms-appdata:///local/alquimia-art.png";
        }
      } catch {
        /* keep original path */
      }
    }

    const previous = read(configPath, "utf8");
    const next = patchWindowsTerminalSettings(previous, wtImage, {
      opacity: opts.opacity ?? WT_OPACITY,
    });
    atomicWriteFile(configPath, next, opts);
    return {
      ok: true,
      configPath,
      needsReload: true,
      reloadHint: windowsTerminalReloadHint(),
    };
  } catch (err) {
    return {
      ok: false,
      configPath,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * @param {object} [opts]
 */
export function clearWindowsTerminalBackground(opts = {}) {
  const exists = opts.existsSync ?? fsExistsSync;
  const read = opts.readFileSync ?? fsReadFileSync;
  const candidates = windowsTerminalSettingsCandidates(opts);
  const targets = candidates.filter((p) => exists(p));
  if (targets.length === 0) {
    return { ok: true, configPath: null, changed: false, needsReload: false };
  }
  try {
    let changed = false;
    let last = targets[0];
    for (const p of targets) {
      last = p;
      const prev = read(p, "utf8");
      const next = clearWindowsTerminalSettings(prev);
      if (next !== prev) {
        atomicWriteFile(p, next, opts);
        changed = true;
      }
    }
    return {
      ok: true,
      configPath: last,
      changed,
      needsReload: changed,
      reloadHint: changed ? windowsTerminalReloadHint() : undefined,
    };
  } catch (err) {
    return {
      ok: false,
      configPath: targets[0],
      changed: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Tilix (gsettings) ────────────────────────────────────────────────

const TILIX_SCHEMA = "com.gexperts.Tilix.Settings";

/**
 * @param {string} imagePath
 * @param {{ spawnSync?: typeof spawnSync }} [opts]
 */
export function setTilixBackground(imagePath, opts = {}) {
  const run = opts.spawnSync ?? spawnSync;
  const set = run(
    "gsettings",
    ["set", TILIX_SCHEMA, "background-image", imagePath],
    { encoding: "utf8" }
  );
  if (set.status !== 0) {
    return {
      ok: false,
      error:
        set.stderr?.trim() ||
        "gsettings falló. ¿Tilix instalado? Tip: el fondo requiere transparencia en el profile.",
    };
  }
  // Best-effort mode.
  run("gsettings", ["set", TILIX_SCHEMA, "background-image-mode", "scale"], {
    encoding: "utf8",
  });
  return {
    ok: true,
    needsReload: false,
    tip: "Si no se ve: subí la transparencia del profile en Tilix (Preferences).",
  };
}

/**
 * @param {{ spawnSync?: typeof spawnSync }} [opts]
 */
export function clearTilixBackground(opts = {}) {
  const run = opts.spawnSync ?? spawnSync;
  const set = run(
    "gsettings",
    ["set", TILIX_SCHEMA, "background-image", ""],
    { encoding: "utf8" }
  );
  if (set.status !== 0) {
    return {
      ok: false,
      error: set.stderr?.trim() || "gsettings falló al limpiar Tilix.",
    };
  }
  return { ok: true, changed: true, needsReload: false };
}

// ── Terminology (tybg) ───────────────────────────────────────────────

/**
 * @param {string|null} imagePath null clears
 * @param {{ spawnSync?: typeof spawnSync }} [opts]
 */
export function setTerminologyBackground(imagePath, opts = {}) {
  const run = opts.spawnSync ?? spawnSync;
  const args = imagePath ? [imagePath] : [];
  const result = run("tybg", args, { encoding: "utf8" });
  if (result.error && result.error.code === "ENOENT") {
    return {
      ok: false,
      error: "No encuentro `tybg` (helper de Terminology) en el PATH.",
    };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      error: result.stderr?.trim() || "tybg falló.",
    };
  }
  return { ok: true, needsReload: false };
}

export function clearTerminologyBackground(opts = {}) {
  return setTerminologyBackground(null, opts);
}

// ── Kitty / iTerm helpers used by art.js ─────────────────────────────

/**
 * @param {string|null} path
 */
export function writeItermBackground(path) {
  const payload = path ? Buffer.from(path, "utf8").toString("base64") : "";
  process.stdout.write(`\x1b]1337;SetBackgroundImageFile=${payload}\x07`);
}

/**
 * @param {string[]} args
 * @returns {Promise<{ ok: boolean, stderr: string, code: number }>}
 */
export function runKittyRemote(args) {
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
 * @param {string|null} path
 * @returns {Promise<{ ok: boolean, tip?: string }>}
 */
export async function setKittyBackground(path) {
  const args = path
    ? ["set-background-image", path]
    : ["set-background-image", "none"];
  const result = await runKittyRemote(args);
  if (result.ok) return { ok: true };
  return {
    ok: false,
    tip:
      "Kitty necesita remote control. En kitty.conf: allow_remote_control yes " +
      "(o ask) y un listen_on / socket.",
  };
}

// ── shared clear helper ──────────────────────────────────────────────

function clearMarkedConfigs({
  candidates,
  clearFn,
  reloadHint,
  marker = BLOCK_BEGIN,
  altMarker,
  opts,
}) {
  const exists = opts.existsSync ?? fsExistsSync;
  const read = opts.readFileSync ?? fsReadFileSync;
  const targets = candidates.filter((p) => {
    if (!exists(p)) return false;
    try {
      const t = read(p, "utf8");
      return t.includes(marker) || (altMarker && t.includes(altMarker));
    } catch {
      return false;
    }
  });
  if (targets.length === 0) {
    return { ok: true, configPath: null, changed: false, needsReload: false };
  }
  try {
    let changed = false;
    let last = targets[0];
    for (const p of targets) {
      last = p;
      const prev = read(p, "utf8");
      const next = clearFn(prev);
      if (next !== prev) {
        atomicWriteFile(p, next, opts);
        changed = true;
      }
    }
    return {
      ok: true,
      configPath: last,
      changed,
      needsReload: changed,
      reloadHint: changed ? reloadHint : undefined,
    };
  } catch (err) {
    return {
      ok: false,
      configPath: targets[0],
      changed: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
