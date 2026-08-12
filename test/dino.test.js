import { describe, it, expect, vi } from "vitest";
import {
  applyJump,
  createInitialState,
  hitsObstacle,
  parseKey,
  reduceInput,
  renderField,
  renderFrame,
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
  TICK_MS,
  TARGET_FPS,
  DT,
  attachDinoInput,
  playDino,
} from "../src/dino/game.js";
import { createFakeStdin, createFakeStdout, KEY } from "./helpers/fake-tty.js";
import { mkdtempSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BRAILLE_RE = /[\u2800-\u28FF]/;

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
    const stdin = createFakeStdin();
    const stdout = createFakeStdout(80);
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

    const noRaw = createFakeStdin();
    noRaw.setRawMode = undefined;
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
    expect(JUMP_VELOCITY).toBeCloseTo(2.85 * DT, 5);
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

  it("renderFrame has Spanish HUD + hi-score + game over overlay", () => {
    const s = createInitialState({ width: 48, seed: 2 });
    const frame = renderFrame(s, { hiScore: 12 });
    expect(frame).toMatch(/Alquimia Runner/);
    expect(frame).toMatch(/★/);
    expect(frame).toMatch(/HI\s+12/);
    expect(frame).toMatch(/Espacio/);
    expect(frame).toMatch(BRAILLE_RE);
    expect(
      frame.split("\n").filter((l) => l.includes("Alquimia Runner"))
    ).toHaveLength(1);

    const over = renderFrame(
      { ...s, status: "over", score: 9 },
      { hiScore: 12 }
    );
    expect(over).toMatch(/¡Chocaste!/);
    expect(over).toMatch(/Puntos\s+9/);
    expect(over).toMatch(/Récord\s+12/);
    expect(over).toMatch(/Enter para reiniciar/);
    expect(over).toMatch(/╭/);
    // Overlay keeps braille from the frozen field around the panel
    expect(over).toMatch(BRAILLE_RE);
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
    const { runWithDino } = await import("../src/dino/game.js");
    const job = vi.fn(async ({ useDino }) => {
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
    expect(job).toHaveBeenCalledOnce();
  });
});

describe("dino — input wiring", () => {
  it("attachDinoInput registers and detaches stdin data listener", () => {
    const stdin = createFakeStdin();
    const seen = [];
    const onData = (chunk) => seen.push(String(chunk));
    const detach = attachDinoInput(stdin, onData);
    stdin.emit("data", " ");
    expect(seen).toEqual([" "]);
    detach();
    stdin.emit("data", "q");
    expect(seen).toEqual([" "]);
  });

  it("playDino source wires stdin.on data via attachDinoInput", () => {
    const srcPath = fileURLToPath(
      new URL("../src/dino/game.js", import.meta.url)
    );
    const src = readFileSync(srcPath, "utf8");
    expect(src).toMatch(/stdin\.on\(\s*["']data["']/);
    expect(src).toMatch(/attachDinoInput\(\s*stdin\s*,\s*onData\s*\)/);
    expect(src).toContain('detachInput = attachDinoInput');
  });

  it("playDino listens for jump/quit keys after raw mode", async () => {
    const stdin = createFakeStdin();
    const stdout = createFakeStdout(64);
    const dir = mkdtempSync(join(tmpdir(), "alquimia-dino-"));
    const session = playDino({
      stdin,
      stdout,
      width: 48,
      tickMs: 10_000,
      hiScorePath: join(dir, "hi.json"),
      env: {},
    });
    expect(stdin.isRaw).toBe(true);
    expect(stdin.listenerCount("data")).toBe(1);
    stdin.emit("data", KEY.q);
    const ended = await session;
    expect(ended.status).toBe("stopped");
    expect(stdin.listenerCount("data")).toBe(0);
  });
});
