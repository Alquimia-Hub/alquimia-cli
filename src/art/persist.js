import {
  copyFileSync as fsCopyFileSync,
  existsSync as fsExistsSync,
  mkdirSync as fsMkdirSync,
  statSync as fsStatSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Persistent copy of brand art so npm global updates don't break config paths.
 * XDG-ish: ~/.local/share/alquimia/art.png
 * @param {string} bundledPath
 * @param {{
 *   home?: string,
 *   existsSync?: (p: string) => boolean,
 *   mkdirSync?: typeof fsMkdirSync,
 *   copyFileSync?: typeof fsCopyFileSync,
 *   statSync?: typeof fsStatSync,
 * }} [opts]
 * @returns {string} absolute path to persisted art
 */
export function ensurePersistedArt(bundledPath, opts = {}) {
  const home = opts.home ?? homedir();
  const exists = opts.existsSync ?? fsExistsSync;
  const mkdir = opts.mkdirSync ?? fsMkdirSync;
  const copy = opts.copyFileSync ?? fsCopyFileSync;
  const stat = opts.statSync ?? fsStatSync;

  const dir = join(home, ".local", "share", "alquimia");
  const dest = join(dir, "art.png");

  mkdir(dir, { recursive: true });

  let needsCopy = !exists(dest);
  if (!needsCopy && exists(bundledPath)) {
    try {
      const a = stat(bundledPath);
      const b = stat(dest);
      if (a.size !== b.size || a.mtimeMs > b.mtimeMs) needsCopy = true;
    } catch {
      needsCopy = true;
    }
  }

  if (needsCopy) {
    copy(bundledPath, dest);
  }

  return dest;
}
