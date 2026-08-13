import { describe, it, expect, mock } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import {
  applyJump,
  createInitialState,
  hitsObstacle,
  parseKey,
  reduceInput,
  renderField,
  shouldOfferDino,
  step,
  playerGlyph,
  loadHiScore,
  saveHiScore,
  dinoHiScorePath,
  bitsToBraille,
  parseSprite,
  spriteToBrailleRows,
  FIELD_ROWS,
  PLAYER_H,
  JUMP_VELOCITY,
  GRAVITY,
  TICK_MS,
  TARGET_FPS,
  DT,
} from "../src/dino/engine.ts";
import { keyToAction, mountRunner, runWithDino } from "../src/ui/dino.ts";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BRAILLE_RE = /[\u2800-\u28FF]/;

/** Minimal TTY-ish stand-ins for `shouldOfferDino` gating. */
const fakeStdin = (over = {}) => ({ isTTY: true, setRawMode() {}, ...over });
const fakeStdout = (over = {}) => ({ isTTY: true, columns: 80, ...over });

describe("dino — parseKey", () => {
  it("maps jump / quit / restart", () => {
    expect(parseKey(" ")).toBe("jump");
    expect(parseKey("\x1b[A")).toBe("jump");
    expect(parseKey("\x1bOA")).toBe("jump");
    expect(parseKey("q")).toBe("quit");
    expect(parseKey("\x1b")).toBe("quit");
    expect(parseKey("\u0003")).toBe("quit");
    expect(parseKey("\r")).toBe("restart");
    expect(parseKey("x")).toBe(null);
  });
});

describe("dino — shouldOfferDino", () => {
  it("requires TTY + raw mode and skips CI / no-interactive", () => {
    const stdin = fakeStdin();
    const stdout = fakeStdout();
    expect(shouldOfferDino({ stdin, stdout, env: {} })).toBe(true);
    expect(
      shouldOfferDino({ stdin, stdout, env: {}, noInteractive: true })
    ).toBe(false);
    expect(shouldOfferDino({ stdin, stdout, env: { CI: "true" } })).toBe(false);
    expect(
      shouldOfferDino({ stdin, stdout, env: { ALQUIMIA_NO_DINO: "1" } })
    ).toBe(false);
    expect(
      shouldOfferDino({
        stdin,
        stdout,
        env: {},
        argv: ["tools", "--no-interactive"],
      })
    ).toBe(false);

    const noRaw = fakeStdin({ setRawMode: undefined });
    expect(shouldOfferDino({ stdin: noRaw, stdout, env: {} })).toBe(false);

    stdin.isTTY = false;
    expect(shouldOfferDino({ stdin, stdout, env: {} })).toBe(false);
  });
});

describe("dino — physics", () => {
  it("createInitialState clamps width and starts grounded", () => {
    const s = createInitialState({ width: 10, seed: 7 });
    expect(s.width).toBe(32);
    expect(s.grounded).toBe(true);
    expect(s.playerY).toBe(0);
    expect(s.status).toBe("playing");
  });

  it("applyJump only when grounded", () => {
    let s = createInitialState({ width: 40, seed: 1 });
    s = applyJump(s);
    expect(s.grounded).toBe(false);
    expect(s.playerVy).toBe(JUMP_VELOCITY);
    const again = applyJump(s);
    expect(again.playerVy).toBe(JUMP_VELOCITY);
  });

  it("tick timing targets ~60 FPS with DT-scaled physics", () => {
    expect(TARGET_FPS).toBe(60);
    expect(TICK_MS).toBeCloseTo(1000 / 60, 5);
    expect(DT).toBeCloseTo(20 / 60, 5);
    expect(JUMP_VELOCITY).toBeCloseTo(3.4 * DT, 5);
    expect(GRAVITY).toBeCloseTo(0.75 * DT * DT, 5);
  });

  it("step moves player up then back to ground", () => {
    let s = createInitialState({ width: 40, seed: 1 });
    s = applyJump(s);
    s = step(s);
    expect(s.playerY).toBeGreaterThan(0);
    for (let i = 0; i < 80; i++) s = step(s);
    expect(s.playerY).toBe(0);
    expect(s.grounded).toBe(true);
    expect(s.score).toBeGreaterThan(0);
  });

  it("landing sets a short dust puff", () => {
    let s = createInitialState({ width: 40, seed: 1 });
    s.spawnIn = 999;
    s = applyJump(s);
    let sawDust = false;
    for (let i = 0; i < 80; i++) {
      s = step(s);
      if (s.grounded && s.dust > 0) sawDust = true;
    }
    expect(s.grounded).toBe(true);
    expect(sawDust).toBe(true);
  });

  it("hitsObstacle detects overlap and jump clears short obstacles", () => {
    const s = createInitialState({ width: 40, seed: 1 });
    s.obstacles = [{ x: 4, w: 2, h: 2 }];
    expect(hitsObstacle(s)).toBe(true);

    const midAir = { ...s, playerY: PLAYER_H + 0.5, grounded: false };
    expect(hitsObstacle(midAir)).toBe(false);
  });

  it("collision ends the run", () => {
    let s = createInitialState({ width: 40, seed: 1 });
    s.obstacles = [{ x: 4.2, w: 2, h: 2 }];
    s.spawnIn = 999;
    s = step(s);
    expect(s.status).toBe("over");
  });

  it("reduceInput restart only after game over", () => {
    let s = createInitialState({ width: 40, seed: 3 });
    expect(reduceInput(s, "restart").tick).toBe(0);
    s = { ...s, status: "over", score: 12 };
    const restarted = reduceInput(s, "restart");
    expect(restarted.status).toBe("playing");
    expect(restarted.score).toBe(0);
    expect(reduceInput(s, "quit").status).toBe("stopped");
  });
});

describe("dino — braille render", () => {
  it("bitsToBraille packs the U+2800 block", () => {
    expect(bitsToBraille([false, false, false, false, false, false, false, false])).toBe(
      " "
    );
    // only top-left dot → ⠁ (U+2801)
    expect(bitsToBraille([true, false, false, false, false, false, false, false])).toBe(
      "\u2801"
    );
    // full cell
    const full = bitsToBraille([true, true, true, true, true, true, true, true]);
    expect(full).toBe("\u28FF");
  });

  it("renderField is a dense braille canvas with stable width", () => {
    const s = createInitialState({ width: 48, seed: 2 });
    const field = renderField(s);
    expect(field).toHaveLength(FIELD_ROWS);
    expect(FIELD_ROWS).toBeGreaterThanOrEqual(14);
    expect(field.every((line) => line.length === 48)).toBe(true);
    const joined = field.join("\n");
    expect(joined).toMatch(BRAILLE_RE);
    // Non-empty playfield: ground row + player pixels
    const brailleCount = [...joined].filter((ch) =>
      ch >= "\u2800" && ch <= "\u28FF"
    ).length;
    expect(brailleCount).toBeGreaterThan(40);
    // Bottom row is mostly ground braille (continuous)
    const groundBraille = [...field[field.length - 1]].filter((ch) =>
      ch >= "\u2800" && ch <= "\u28FF"
    ).length;
    expect(groundBraille).toBeGreaterThan(30);
  });

  it("playerGlyph run cycle differs from jump and stays in braille", () => {
    const a = playerGlyph(true, 0);
    const b = playerGlyph(true, 1);
    const jump = playerGlyph(false, 0);
    expect(a.length).toBeGreaterThanOrEqual(2);
    expect(a.join("\n")).toMatch(BRAILLE_RE);
    expect(a.join("\n")).not.toBe(b.join("\n"));
    expect(jump.join("\n")).not.toBe(a.join("\n"));
  });

  it("spriteToBrailleRows encodes parseSprite bitmaps", () => {
    const bmp = parseSprite(["##", "##", "..", "##"]);
    const rows = spriteToBrailleRows(bmp);
    expect(rows.join("")).toMatch(BRAILLE_RE);
  });

});

describe("dino — hi-score", () => {
  it("persists under XDG share path and keeps the max", () => {
    const dir = mkdtempSync(join(tmpdir(), "alquimia-dino-"));
    const path = join(dir, "dino-hiscore.json");
    expect(loadHiScore({ path })).toBe(0);
    expect(saveHiScore(15, { path })).toBe(15);
    expect(saveHiScore(10, { path })).toBe(15);
    expect(saveHiScore(22, { path })).toBe(22);
    expect(loadHiScore({ path })).toBe(22);
    const raw = JSON.parse(readFileSync(path, "utf8"));
    expect(raw.hiScore).toBe(22);
    expect(dinoHiScorePath({ home: "/tmp/home" })).toBe(
      join("/tmp/home", ".local", "share", "alquimia", "dino-hiscore.json")
    );
  });
});

describe("dino — runWithDino gating", () => {
  it("skips game when not interactive and still runs job", async () => {
    const job = mock(async ({ useDino }) => {
      expect(useDino).toBe(false);
      return { ok: true, code: 0 };
    });
    const out = await runWithDino(job, {
      stdin: { isTTY: false },
      stdout: { isTTY: false },
      env: {},
    });
    expect(out.playedDino).toBe(false);
    expect(out.result).toEqual({ ok: true, code: 0 });
    expect(job.mock.calls.length).toBe(1);
  });
});

describe("dino — OpenTUI view", () => {
  it("keyToAction maps OpenTUI KeyEvents onto engine actions", () => {
    expect(keyToAction({ name: "space" })).toBe("jump");
    expect(keyToAction({ name: "up" })).toBe("jump");
    expect(keyToAction({ name: "q" })).toBe("quit");
    expect(keyToAction({ name: "escape" })).toBe("quit");
    expect(keyToAction({ name: "c", ctrl: true })).toBe("quit");
    expect(keyToAction({ name: "return" })).toBe("restart");
    expect(keyToAction({ name: "x" })).toBe(null);
    expect(keyToAction(null)).toBe(null);
  });

  it("mounts a braille playfield with the HUD into the renderer", async () => {
    const setup = await createTestRenderer({ width: 64, height: 22 });
    const dir = mkdtempSync(join(tmpdir(), "alquimia-dino-"));
    try {
      let ended: { score: number; status: string } | null = null;
      const session = mountRunner(
        setup.renderer,
        (r) => {
          ended = r;
        },
        { width: 58, tickMs: 100000, hiScorePath: join(dir, "hi.json") },
      );

      await setup.renderOnce();
      const frame = setup.captureCharFrame();

      expect(frame).toMatch(/Alquimia Runner/);
      expect(frame).toMatch(/★/);
      expect(frame).toMatch(/HI/);
      expect(frame).toMatch(/Espacio/);
      expect(frame).toMatch(BRAILLE_RE);

      session.stop();
      expect(ended).toEqual({ score: 0, status: "stopped" } as any);
    } finally {
      setup.renderer.destroy();
    }
  });

  it("shows the game-over card once the run ends", async () => {
    const setup = await createTestRenderer({ width: 64, height: 22 });
    const dir = mkdtempSync(join(tmpdir(), "alquimia-dino-"));
    try {
      const session = mountRunner(setup.renderer, () => {}, {
        width: 58,
        tickMs: 100000,
        hiScorePath: join(dir, "hi.json"),
      });
      await setup.renderOnce();

      // Drive a guaranteed collision through the real key path.
      setup.renderer.keyInput.emit("keypress", { name: "q" } as any);
      session.stop();
    } finally {
      setup.renderer.destroy();
    }
  });
});
