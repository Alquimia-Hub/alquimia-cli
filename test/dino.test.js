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
  PLAYER_H,
  JUMP_VELOCITY,
} from "../src/dino/game.js";
import { createFakeStdin, createFakeStdout } from "./helpers/fake-tty.js";

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
  it("renderField includes player and keeps width", () => {
    const s = createInitialState({ width: 36, seed: 2 });
    const field = renderField(s);
    expect(field).toHaveLength(5);
    expect(field.every((line) => line.length === 36)).toBe(true);
    expect(field.join("\n")).toMatch(/ο/);
  });

  it("renderFrame has Spanish HUD", () => {
    const s = createInitialState({ width: 36, seed: 2 });
    const frame = renderFrame(s);
    expect(frame).toMatch(/Alquimia Runner/);
    expect(frame).toMatch(/Puntos:/);
    expect(frame).toMatch(/Espacio/);

    const over = renderFrame({ ...s, status: "over", score: 9 });
    expect(over).toMatch(/¡Chocaste!/);
    expect(over).toMatch(/Enter para reiniciar/);
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
