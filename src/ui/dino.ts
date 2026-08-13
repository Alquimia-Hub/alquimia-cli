/**
 * Alquimia Runner — OpenTUI view over the pure engine in `src/dino/engine.js`.
 *
 * The engine still composes the playfield as braille glyphs (2×4 subpixels per
 * cell) plus a parallel role grid. This view blits those into a
 * `FrameBufferRenderable` and colors each cell by role, so OpenTUI owns the
 * surface, the diffing and the frame pacing while the pixel art stays ours.
 */

import {
  BoxRenderable,
  FrameBufferRenderable,
  RGBA,
  Text,
  TextAttributes,
  TextRenderable,
  type CliRenderer,
  type KeyEvent,
} from "@opentui/core";
import {
  FIELD_ROWS,
  TICK_MS,
  composeField,
  createInitialState,
  loadHiScore,
  reduceInput,
  saveHiScore,
  shouldOfferDino,
  step,
} from "../dino/engine.ts";
import type { GameState, DinoAction } from "../dino/engine.ts";
import { runApp, type InteractiveOpts } from "./app.ts";
import { border, dinoRoles, palette } from "./theme.ts";

/** How a run ended, plus the score it reached. */
export interface DinoResult {
  score: number;
  status: string;
}

export interface RunnerOpts extends InteractiveOpts {
  sidecar?: boolean;
  width?: number;
  tickMs?: number;
  hiScorePath?: string;
  argv?: string[];
}

const TRANSPARENT = RGBA.fromValues(0, 0, 0, 0);

/** Role name → RGBA, built once (allocating per cell would thrash the loop). */
const ROLE_RGBA = Object.fromEntries(
  Object.entries(dinoRoles).map(([role, hex]) => [role, RGBA.fromHex(hex)]),
);

/** Map an OpenTUI KeyEvent onto an engine action. */
export function keyToAction(key?: Partial<KeyEvent> | null): DinoAction {
  if (!key) return null;
  if (key.ctrl && key.name === "c") return "quit";
  if (key.name === "q" || key.name === "escape") return "quit";
  if (key.name === "space" || key.name === "up" || key.name === "w") return "jump";
  if (key.name === "return" || key.name === "enter") return "restart";
  return null;
}

/** Paint one composed frame into the framebuffer. */
function paintField(canvas: FrameBufferRenderable, state: GameState): void {
  const { chars, roles } = composeField(state);
  const fb = canvas.frameBuffer;

  for (let y = 0; y < chars.length; y++) {
    const row = chars[y];
    const roleRow = roles[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      const color = ROLE_RGBA[roleRow[x]] ?? ROLE_RGBA.sky;
      fb.setCell(
        x,
        y,
        ch,
        color,
        TRANSPARENT,
        roleRow[x] === "player" || roleRow[x] === "crash" ? TextAttributes.BOLD : 0,
      );
    }
  }
}

/** Build the runner UI inside a running renderer and drive the game loop. */
export function mountRunner(
  renderer: CliRenderer,
  exit: (result: DinoResult) => void,
  opts: RunnerOpts = {},
): { stop: () => void } {
  const sidecar = Boolean(opts.sidecar);
  const tickMs = opts.tickMs ?? TICK_MS;
  const hiOpts = opts.hiScorePath ? { path: opts.hiScorePath } : {};

  const width =
    opts.width ?? Math.min(96, Math.max(40, (renderer.width || 64) - 4));

  let state = createInitialState({ width, seed: (Date.now() % 100000) + 1 });
  let hiScore = loadHiScore(hiOpts);

  const root = new BoxRenderable(renderer, {
    id: "runner",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    paddingLeft: 2,
    paddingTop: 1,
  });

  const title = new TextRenderable(renderer, {
    id: "runner-title",
    content: "Alquimia Runner",
    fg: palette.cyan,
    attributes: TextAttributes.BOLD,
  });
  const scoreText = new TextRenderable(renderer, {
    id: "runner-score",
    content: "",
    fg: palette.gold,
  });
  const hiText = new TextRenderable(renderer, {
    id: "runner-hi",
    content: "",
    fg: palette.faint,
  });

  const hud = new BoxRenderable(renderer, {
    id: "runner-hud",
    flexDirection: "row",
    width,
    justifyContent: "space-between",
    flexShrink: 0,
  });
  hud.add(title);
  hud.add(scoreText);
  hud.add(hiText);
  root.add(hud);

  if (sidecar) {
    root.add(
      Text({ content: "mientras instalamos…", fg: palette.faint }),
    );
  }

  const canvas = new FrameBufferRenderable(renderer, {
    id: "runner-canvas",
    width,
    height: FIELD_ROWS,
    flexShrink: 0,
  });
  root.add(canvas);

  const hint = new TextRenderable(renderer, {
    id: "runner-hint",
    content: "Espacio/↑ saltá · q/Esc salí",
    fg: palette.faint,
  });
  root.add(hint);

  /** Game-over card, mounted only when the run ends. */
  let overPanel: BoxRenderable | null = null;

  const clearPanel = () => {
    if (!overPanel) return;
    root.remove(overPanel);
    overPanel = null;
  };

  const showPanel = () => {
    if (overPanel) return;
    const record = Math.max(hiScore, state.score);
    overPanel = new BoxRenderable(renderer, {
      id: "runner-over",
      position: "absolute",
      left: Math.max(0, Math.floor((width - 34) / 2)),
      top: Math.max(1, Math.floor(FIELD_ROWS / 2) - 2),
      width: 34,
      borderStyle: border.style,
      borderColor: palette.red,
      backgroundColor: "#12121A",
      paddingLeft: 1,
      paddingRight: 1,
      flexDirection: "column",
      title: "¡Chocaste!",
      titleColor: palette.red,
      titleAlignment: "center",
    });
    overPanel.add(Text({ content: `Puntos  ${state.score}`, fg: palette.gold }));
    overPanel.add(Text({ content: `Récord  ${record}`, fg: palette.cyan }));
    overPanel.add(Text({ content: "" }));
    overPanel.add(
      Text({
        content: sidecar ? "seguí · auto-restart" : "Enter reiniciá · q/Esc salí",
        fg: palette.muted,
      }),
    );
    root.add(overPanel);
  };

  const syncHud = () => {
    const shown = Math.max(hiScore, state.status === "over" ? state.score : hiScore);
    scoreText.content = `★ ${String(state.score).padStart(4, " ")}`;
    hiText.content = `HI ${String(shown).padStart(4, " ")}`;
  };

  const noteHi = () => {
    if (state.score > hiScore) hiScore = saveHiScore(state.score, hiOpts);
  };

  const draw = () => {
    paintField(canvas, state);
    syncHud();
    if (state.status === "over") showPanel();
    else clearPanel();
  };

  renderer.root.add(root);
  renderer.requestLive();

  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const finish = (status: string) => {
    if (stopped) return;
    stopped = true;
    if (timer) clearInterval(timer);
    renderer.keyInput.off("keypress", onKey);
    renderer.dropLive();
    noteHi();
    exit({ score: state.score, status });
  };

  const restartForSidecar = () => {
    noteHi();
    state = createInitialState({ width: state.width, seed: state.rng || 1 });
  };

  function onKey(key: KeyEvent) {
    if (stopped) return;
    const action = keyToAction(key);
    if (!action) return;
    if (sidecar && action === "restart") return;
    if (state.status === "over" && action === "restart") noteHi();

    state = reduceInput(state, action);

    if (state.status === "stopped") {
      draw();
      finish("stopped");
      return;
    }
    if (state.status === "over" && sidecar) restartForSidecar();
    draw();
  }

  renderer.keyInput.on("keypress", onKey);
  draw();

  timer = setInterval(() => {
    if (stopped) return;
    if (state.status !== "playing") {
      if (sidecar && state.status === "over") restartForSidecar();
      else return;
    }
    state = step(state);
    if (state.status === "over") {
      noteHi();
      if (sidecar) {
        draw();
        restartForSidecar();
        return;
      }
    }
    draw();
  }, tickMs);

  return {
    stop: () => finish("stopped"),
  };
}

/** Play the runner full-screen. */
export async function playDino(opts: RunnerOpts = {}): Promise<DinoResult> {
  if (!shouldOfferDino(opts)) return { score: 0, status: "skipped" };

  const result = await runApp<DinoResult>(
    ({ renderer, exit }) => {
      mountRunner(renderer, exit, opts);
    },
    { targetFps: 60 },
  );

  return result ?? { score: 0, status: "stopped" };
}

/**
 * Run an async job with the runner playing alongside it.
 *
 * The job's own output is piped rather than inherited, because the renderer
 * owns the screen while it runs; callers print the captured output afterwards.
 */
export async function runWithDino<T>(
  job: (ctx: { useDino: boolean }) => Promise<T>,
  opts: RunnerOpts = {},
): Promise<{ result: T; playedDino: boolean; dinoScore: number }> {
  if (!shouldOfferDino(opts)) {
    const result = await job({ useDino: false });
    return { result, playedDino: false, dinoScore: 0 };
  }

  let jobResult!: T;
  let jobError: unknown;

  const ended = await runApp<DinoResult>(
    ({ renderer, exit }) => {
      const session = mountRunner(renderer, exit, { ...opts, sidecar: true });

      job({ useDino: true })
        .then((value) => {
          jobResult = value;
        })
        .catch((err) => {
          jobError = err;
        })
        .finally(() => {
          session.stop();
        });
    },
    { targetFps: 60 },
  );

  if (jobError) throw jobError;

  return {
    result: jobResult,
    playedDino: true,
    dinoScore: ended?.score ?? 0,
  };
}
