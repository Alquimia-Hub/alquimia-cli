import { describe, it, expect } from "bun:test";
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
      const mod = await import("../src/update.ts");
      expect(typeof mod.compareSemver).toBe("function");
      expect(typeof mod.shouldCheck).toBe("function");
    }
  );

  it.skipIf(!existsSync(artPath))("art.getArtPath points at bundled asset", async () => {
    const { getArtPath } = await import("../src/art.ts");
    const path = getArtPath();
    expect(path).toMatch(/art\.png$/);
    expect(existsSync(path)).toBe(true);
  });

  it.skipIf(!existsSync(artPath))(
    "art.detectTerminal returns a known family",
    async () => {
      const { detectTerminal } = await import("../src/art.ts");
      // Prefer pure detectTerminal(env) so multi-terminal signals don't leak from the host.
      expect(
        detectTerminal({ TERM_PROGRAM: "", TERM: "xterm-256color" })
      ).toBe("unsupported");
      expect(detectTerminal({ ITERM_SESSION_ID: "w0t0p0:test" })).toBe("iterm2");
      expect(detectTerminal({ KITTY_WINDOW_ID: "1" })).toBe("kitty");
      expect(detectTerminal({ TERM_PROGRAM: "ghostty" })).toBe("ghostty");
    }
  );
});
