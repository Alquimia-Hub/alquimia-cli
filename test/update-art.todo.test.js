import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const updatePath = join(root, "src/update.js");
const artPath = join(root, "src/art.js");

/**
 * Optional modules: skip only when absent.
 * - `src/update.js` has full coverage in `test/update.test.js` once present.
 * - `src/art.js`: light smoke here (path + terminal detect) when present.
 */
describe("update.js / art.js (optional — skip if missing)", () => {
  it.skipIf(!existsSync(updatePath))(
    "update.js loads (full suite lives in update.test.js)",
    async () => {
      const mod = await import("../src/update.js");
      expect(typeof mod.compareSemver).toBe("function");
      expect(typeof mod.shouldCheck).toBe("function");
    }
  );

  it.skipIf(!existsSync(artPath))("art.getArtPath points at bundled asset", async () => {
    const { getArtPath } = await import("../src/art.js");
    const path = getArtPath();
    expect(path).toMatch(/art\.png$/);
    expect(existsSync(path)).toBe(true);
  });

  it.skipIf(!existsSync(artPath))(
    "art.detectTerminal returns a known family",
    async () => {
      const { detectTerminal } = await import("../src/art.js");
      const prev = {
        ITERM_SESSION_ID: process.env.ITERM_SESSION_ID,
        KITTY_WINDOW_ID: process.env.KITTY_WINDOW_ID,
        WEZTERM_EXECUTABLE: process.env.WEZTERM_EXECUTABLE,
        WEZTERM_PANE: process.env.WEZTERM_PANE,
        TERM_PROGRAM: process.env.TERM_PROGRAM,
        TERM: process.env.TERM,
      };
      try {
        delete process.env.ITERM_SESSION_ID;
        delete process.env.KITTY_WINDOW_ID;
        delete process.env.WEZTERM_EXECUTABLE;
        delete process.env.WEZTERM_PANE;
        process.env.TERM_PROGRAM = "";
        process.env.TERM = "xterm-256color";
        expect(detectTerminal()).toBe("unsupported");

        process.env.ITERM_SESSION_ID = "w0t0p0:test";
        expect(detectTerminal()).toBe("iterm2");
        delete process.env.ITERM_SESSION_ID;

        process.env.KITTY_WINDOW_ID = "1";
        expect(detectTerminal()).toBe("kitty");
      } finally {
        for (const [k, v] of Object.entries(prev)) {
          if (v === undefined) delete process.env[k];
          else process.env[k] = v;
        }
      }
    }
  );
});
