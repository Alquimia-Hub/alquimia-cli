import { dirname } from "node:path";
import {
  mkdirSync as fsMkdirSync,
  renameSync as fsRenameSync,
  writeFileSync as fsWriteFileSync,
} from "node:fs";

/** Default line-comment markers for Ghostty / Contour YAML / generic configs. */
export const BLOCK_BEGIN = "# >>> alquimia-art >>>";
export const BLOCK_END = "# <<< alquimia-art <<<";

/** Lua (WezTerm). */
export const LUA_BLOCK_BEGIN = "-- >>> alquimia-art >>>";
export const LUA_BLOCK_END = "-- <<< alquimia-art <<<";

/** JS (Hyper). */
export const JS_BLOCK_BEGIN = "// >>> alquimia-art >>>";
export const JS_BLOCK_END = "// <<< alquimia-art <<<";

/** CSS (inside Hyper/Tabby css strings). */
export const CSS_BLOCK_BEGIN = "/* >>> alquimia-art >>> */";
export const CSS_BLOCK_END = "/* <<< alquimia-art <<< */";

/** Legacy Ghostty single-line marker from earlier alquimia art. */
export const LEGACY_GHOSTTY_MARKER = "# alquimia-art";

/**
 * Remove a BEGIN/END managed block (inclusive). Pure.
 * @param {string} content
 * @param {string} beginMarker
 * @param {string} endMarker
 * @returns {string}
 */
export function clearConfigBlock(content, beginMarker, endMarker) {
  const text = content == null ? "" : String(content);
  const begin = beginMarker;
  const end = endMarker;
  const lines = text.split(/\r?\n/);
  const out = [];
  let skipping = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!skipping && trimmed === begin) {
      skipping = true;
      continue;
    }
    if (skipping) {
      if (trimmed === end) skipping = false;
      continue;
    }
    out.push(line);
  }

  return collapseExtraBlanks(out.join("\n"));
}

/**
 * Idempotently insert/replace a managed block at the end of the file.
 * @param {string} content
 * @param {string} beginMarker
 * @param {string} endMarker
 * @param {string[]} bodyLines lines inside the block (no markers)
 * @returns {string}
 */
export function patchConfigBlock(content, beginMarker, endMarker, bodyLines) {
  const cleared = clearConfigBlock(content, beginMarker, endMarker);
  const block = [beginMarker, ...bodyLines, endMarker, ""].join("\n");
  if (!cleared.trim()) return block;
  const base = cleared.replace(/\n+$/, "\n");
  return `${base}\n${block}`;
}

/**
 * Insert a managed block immediately after the first line matching `afterRegex`.
 * Falls back to append if no match.
 * @param {string} content
 * @param {RegExp} afterRegex
 * @param {string} beginMarker
 * @param {string} endMarker
 * @param {string[]} bodyLines
 * @returns {string}
 */
export function patchConfigBlockAfter(
  content,
  afterRegex,
  beginMarker,
  endMarker,
  bodyLines
) {
  const cleared = clearConfigBlock(content, beginMarker, endMarker);
  const blockLines = [beginMarker, ...bodyLines, endMarker];
  const lines = cleared.split(/\r?\n/);
  const idx = lines.findIndex((l) => afterRegex.test(l));
  if (idx === -1) {
    return patchConfigBlock(cleared, beginMarker, endMarker, bodyLines);
  }
  const out = [
    ...lines.slice(0, idx + 1),
    ...blockLines,
    ...lines.slice(idx + 1),
  ];
  return collapseExtraBlanks(out.join("\n"));
}

/**
 * Atomic-ish write: write temp then rename. Creates parent dirs.
 * @param {string} filePath
 * @param {string} data
 * @param {{
 *   writeFileSync?: typeof fsWriteFileSync,
 *   renameSync?: typeof fsRenameSync,
 *   mkdirSync?: typeof fsMkdirSync,
 * }} [io]
 */
export function atomicWriteFile(filePath, data, io = {}) {
  const write = io.writeFileSync || fsWriteFileSync;
  const rename = io.renameSync || fsRenameSync;
  const mkdir = io.mkdirSync || fsMkdirSync;
  mkdir(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.alquimia-tmp`;
  write(tmp, data, "utf8");
  rename(tmp, filePath);
}

/**
 * @param {string} text
 * @returns {string}
 */
function collapseExtraBlanks(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    if (
      line.trim() === "" &&
      out.length &&
      out[out.length - 1].trim() === ""
    ) {
      continue;
    }
    out.push(line);
  }
  let result = out.join("\n");
  result = result.replace(/\n+$/, "\n");
  if (result === "\n") return "";
  return result;
}

/**
 * Clear legacy Ghostty `# alquimia-art` + following key pairs.
 * @param {string} content
 * @param {string[]} managedKeys
 * @returns {string}
 */
export function clearLegacyGhosttyMarkers(
  content,
  managedKeys = ["background-image", "background-image-opacity"]
) {
  const text = content == null ? "" : String(content);
  const lines = text.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === LEGACY_GHOSTTY_MARKER) {
      if (i + 1 < lines.length) {
        const next = lines[i + 1].trim();
        if (
          managedKeys.some((k) => new RegExp(`^${k}\\s*=`, "i").test(next))
        ) {
          i += 1;
        }
      }
      continue;
    }
    out.push(lines[i]);
  }
  return collapseExtraBlanks(out.join("\n"));
}
