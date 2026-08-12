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
  FIELD_ROWS,
  PLAYER_H,
  JUMP_VELOCITY,
} from "../src/dino/game.js";
import { createFakeStdin, createFakeStdout } from "./helpers/fake-tty.js";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
    expect(s.width).toBe(28);
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

  it("step moves player up then back to ground", () => {
    let s = createInitialState({ width: 40, seed: 1 });
    s = applyJump(s);
    s = step(s);
    expect(s.playerY).toBeGreaterThan(0);
    for (let i = 0; i < 40; i++) s = step(s);
    expect(s.playerY).toBe(0);
    expect(s.grounded).toBe(true);
    expect(s.score).toBeGreaterThan(0);
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

describe("dino — render", () => {
  it("renderField includes multi-row player and keeps width", () => {
    const s = createInitialState({ width: 36, seed: 2 });
    const field = renderField(s);
    expect(field).toHaveLength(FIELD_ROWS);
    expect(FIELD_ROWS).toBeGreaterThanOrEqual(8);
    expect(field.every((line) => line.length === 36)).toBe(true);
    const joined = field.join("\n");
    expect(joined).toMatch(/[▄█▐▌▀]/);
    // Continuous ground baseline (not sparse lonely dots)
    expect(field[field.length - 1]).toMatch(/▀{8,}/);
  });

  it("playerGlyph has run cycle and jump pose", () => {
    const a = playerGlyph(true, 0);
    const b = playerGlyph(true, 1);
    const jump = playerGlyph(false, 0);
    expect(a).toHaveLength(4);
    expect(a.every((row) => [...row].length === 5)).toBe(true);
    expect(a.join("\n")).not.toBe(b.join("\n"));
    expect(jump.join("\n")).not.toBe(a.join("\n"));
  });

  it("renderFrame has Spanish HUD + hi-score + game over panel", () => {
    const s = createInitialState({ width: 36, seed: 2 });
    const frame = renderFrame(s, { hiScore: 12 });
    expect(frame).toMatch(/Alquimia Runner/);
    expect(frame).toMatch(/★/);
    expect(frame).toMatch(/HI\s+12/);
    expect(frame).toMatch(/Espacio/);
    // No cluttered duplicate title lines
    expect(frame.split("\n").filter((l) => l.includes("Alquimia Runner"))).toHaveLength(1);

    const over = renderFrame({ ...s, status: "over", score: 9 }, { hiScore: 12 });
    expect(over).toMatch(/¡Chocaste!/);
    expect(over).toMatch(/Puntos\s+9/);
    expect(over).toMatch(/Récord\s+12/);
    expect(over).toMatch(/Enter para reiniciar/);
    expect(over).toMatch(/╭/);
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
