import { style } from "../style.js";

/** Rows of the playfield (excluding HUD / hints). */
export const FIELD_ROWS = 5;
/** Player hitbox width in columns. */
export const PLAYER_W = 3;
/** Player standing height in rows. */
export const PLAYER_H = 2;
/** Default obstacle width / height. */
export const OBSTACLE_W = 2;
export const OBSTACLE_H = 2;

export const GRAVITY = 0.55;
export const JUMP_VELOCITY = 2.85;
export const BASE_SPEED = 1.15;
export const SPEED_GAIN = 0.00035;
export const SPAWN_MIN = 28;
export const SPAWN_MAX = 52;
export const TICK_MS = 50;

const CURSOR_HIDE = "\x1b[?25l";
const CURSOR_SHOW = "\x1b[?25h";
const ERASE_DOWN = "\x1b[0J";

/**
 * Whether the dino overlay may run (TTY + interactive, not CI).
 * @param {{
 *   stdin?: { isTTY?: boolean, setRawMode?: Function },
 *   stdout?: { isTTY?: boolean },
 *   env?: NodeJS.ProcessEnv,
 *   noInteractive?: boolean,
 *   argv?: string[],
 * }} [opts]
 */
export function shouldOfferDino({
  stdin = process.stdin,
  stdout = process.stdout,
  env = process.env,
  noInteractive = false,
  argv = process.argv.slice(2),
} = {}) {
  if (noInteractive) return false;
  if (argv?.includes("--no-interactive")) return false;
  if (env.CI === "true" || env.CI === "1") return false;
  if (env.ALQUIMIA_NO_DINO === "1" || env.ALQUIMIA_NO_DINO === "true") {
    return false;
  }
  if (!stdin?.isTTY || !stdout?.isTTY) return false;
  if (typeof stdin.setRawMode !== "function") return false;
  return true;
}

/**
 * @param {string | Buffer} chunk
 * @returns {'jump'|'quit'|'restart'|null}
 */
export function parseKey(chunk) {
  const s = String(chunk);
  if (!s) return null;
  if (s === "\u0003") return "quit";
  if (s === "q" || s === "Q") return "quit";
  if (s === "\x1b") return "quit";
  if (s === " " || s === "w" || s === "W") return "jump";
  if (s === "\x1b[A" || s === "\x1bOA") return "jump";
  if (s === "\r" || s === "\n") return "restart";
  if (s.startsWith("\x1b") && s.length > 1) {
    if (s.includes("A")) return "jump";
    return null;
  }
  return null;
}

/**
 * @param {{ width?: number, seed?: number }} [opts]
 */
export function createInitialState({ width = 48, seed = 1 } = {}) {
  const w = Math.max(28, Math.min(80, Math.floor(width) || 48));
  return {
    width: w,
    tick: 0,
    score: 0,
    speed: BASE_SPEED,
    /** Feet height above ground (>= 0). */
    playerY: 0,
    playerVy: 0,
    grounded: true,
    obstacles: /** @type {{ x: number, w: number, h: number }[]} */ ([]),
    spawnIn: 20,
    status: /** @type {'playing'|'over'|'stopped'} */ ("playing"),
    rng: seed >>> 0 || 1,
    distance: 0,
  };
}

/** Mulberry32 — deterministic for tests. */
export function nextRng(state) {
  let t = (state.rng += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * @param {ReturnType<typeof createInitialState>} state
 */
export function applyJump(state) {
  if (state.status !== "playing") return state;
  if (!state.grounded) return state;
  return {
    ...state,
    playerVy: JUMP_VELOCITY,
    grounded: false,
  };
}

/**
 * Player fixed at x=4. Vertical units match obstacle height rows.
 * @param {ReturnType<typeof createInitialState>} state
 */
export function hitsObstacle(state) {
  const px0 = 4;
  const px1 = px0 + PLAYER_W;
  const py0 = state.playerY;
  const py1 = state.playerY + PLAYER_H;

  for (const ob of state.obstacles) {
    const ox0 = ob.x;
    const ox1 = ob.x + ob.w;
    const oy0 = 0;
    const oy1 = ob.h;
    const overlapX = px0 < ox1 && px1 > ox0;
    const overlapY = py0 < oy1 && py1 > oy0;
    if (overlapX && overlapY) return true;
  }
  return false;
}

/**
 * Advance one physics frame.
 * @param {ReturnType<typeof createInitialState>} state
 */
export function step(state) {
  if (state.status !== "playing") return state;

  let next = {
    ...state,
    tick: state.tick + 1,
    obstacles: state.obstacles.map((o) => ({ ...o })),
  };

  let y = next.playerY + next.playerVy;
  let vy = next.playerVy - GRAVITY;
  let grounded = false;
  if (y <= 0) {
    y = 0;
    vy = 0;
    grounded = true;
  }
  next.playerY = y;
  next.playerVy = vy;
  next.grounded = grounded;

  const spd = BASE_SPEED + next.distance * SPEED_GAIN;
  next.speed = spd;
  next.obstacles = next.obstacles
    .map((o) => ({ ...o, x: o.x - spd }))
    .filter((o) => o.x + o.w > -1);

  next.distance += spd;
  next.score = Math.floor(next.distance);

  next.spawnIn -= 1;
  if (next.spawnIn <= 0) {
    const roll = nextRng(next);
    const h = roll > 0.65 ? 3 : 2;
    const w = roll > 0.8 ? 3 : OBSTACLE_W;
    next.obstacles.push({ x: next.width - 1, w, h });
    const gap = SPAWN_MIN + Math.floor(nextRng(next) * (SPAWN_MAX - SPAWN_MIN));
    next.spawnIn = Math.max(18, gap - Math.floor(spd * 2));
  }

  if (hitsObstacle(next)) {
    next.status = "over";
  }

  return next;
}

/**
 * Original ASCII sprites (not Chrome/Google dino).
 * Player = little alchemist; obstacles = crystal stacks.
 */
function playerGlyph(grounded, tick) {
  if (!grounded) {
    return [" Δ ", "/|\\"];
  }
  return tick % 2 === 0 ? [" ο ", "/|\\"] : [" ο ", "/ \\"];
}

function obstacleGlyph(h, w) {
  const lines = [];
  for (let row = 0; row < h; row++) {
    if (row === h - 1) {
      lines.push(w >= 3 ? "/Y\\" : "Y\\");
    } else if (row === 0) {
      lines.push(w >= 3 ? "/|\\" : "||");
    } else {
      lines.push(w >= 3 ? "|||" : "||");
    }
  }
  return lines.map((l) => l.padEnd(w, " ").slice(0, w));
}

/**
 * Render playfield rows (bottom = ground).
 * @param {ReturnType<typeof createInitialState>} state
 * @returns {string[]}
 */
export function renderField(state) {
  const rows = Array.from({ length: FIELD_ROWS }, () =>
    Array.from({ length: state.width }, () => " ")
  );

  const put = (col, rowFromBottom, ch) => {
    const r = FIELD_ROWS - 1 - rowFromBottom;
    if (r < 0 || r >= FIELD_ROWS) return;
    if (col < 0 || col >= state.width) return;
    if (!ch || ch === " ") return;
    rows[r][col] = ch;
  };

  for (let x = 0; x < state.width; x++) {
    const phase = Math.floor(state.distance + x) % 7;
    if (phase === 0) put(x, 0, "·");
  }

  for (const ob of state.obstacles) {
    const glyph = obstacleGlyph(ob.h, ob.w);
    for (let i = 0; i < glyph.length; i++) {
      const line = glyph[i];
      for (let c = 0; c < line.length; c++) {
        put(Math.floor(ob.x) + c, i, line[c]);
      }
    }
  }

  const lift = Math.max(0, Math.round(state.playerY));
  const pGlyph = playerGlyph(state.grounded, state.tick);
  for (let i = 0; i < pGlyph.length; i++) {
    const rowFromBottom = lift + (pGlyph.length - 1 - i);
    const line = pGlyph[i];
    for (let c = 0; c < line.length; c++) {
      put(4 + c, rowFromBottom, line[c]);
    }
  }

  return rows.map((r) => r.join(""));
}

/**
 * Full frame including HUD (plain, no ANSI).
 * @param {ReturnType<typeof createInitialState>} state
 * @param {{ sidecar?: boolean }} [opts]
 * @returns {string}
 */
export function renderFrame(state, { sidecar = false } = {}) {
  const lines = [];
  const title = sidecar
    ? "Alquimia Runner · mientras instalamos…"
    : "Alquimia Runner";
  lines.push(title);
  lines.push(`Puntos: ${state.score}   vel: ${state.speed.toFixed(1)}`);
  lines.push("─".repeat(Math.min(state.width, 48)));
  lines.push(...renderField(state));
  lines.push("─".repeat(Math.min(state.width, 48)));

  if (state.status === "over") {
    lines.push(`¡Chocaste! Score: ${state.score}`);
    if (!sidecar) {
      lines.push("Enter para reiniciar · q/Esc para salir");
    }
  } else if (state.status === "stopped") {
    lines.push("Listo — volvemos al install/update.");
  } else {
    lines.push("Espacio/↑ saltá · q/Esc salí");
  }
  return lines.join("\n");
}

/**
 * @param {ReturnType<typeof createInitialState>} state
 * @param {'jump'|'quit'|'restart'|null} action
 */
export function reduceInput(state, action) {
  if (!action) return state;
  if (action === "quit") {
    return { ...state, status: "stopped" };
  }
  if (action === "jump") {
    return applyJump(state);
  }
  if (action === "restart" && state.status === "over") {
    return createInitialState({ width: state.width, seed: state.rng || 1 });
  }
  return state;
}

/**
 * @param {ReturnType<typeof createInitialState>} state
 * @param {{ sidecar?: boolean }} [opts]
 */
function paintFrame(state, opts) {
  const raw = renderFrame(state, opts);
  if (!style.enabled) return raw;
  return raw
    .split("\n")
    .map((line, i) => {
      if (i === 0) return style.cyan(style.bold(line));
      if (i === 1) return style.dim(line);
      if (line.startsWith("¡Chocaste")) return style.yellow(line);
      if (
        line.startsWith("Espacio") ||
        line.startsWith("Enter") ||
        line.startsWith("Listo")
      ) {
        return style.dim(line);
      }
      return line;
    })
    .join("\n");
}

/**
 * Play interactive dino on a TTY.
 * @param {{
 *   stdin?: NodeJS.ReadStream,
 *   stdout?: NodeJS.WriteStream,
 *   mode?: 'standalone'|'sidecar',
 *   tickMs?: number,
 *   width?: number,
 * }} [opts]
 * @returns {Promise<{ score: number, status: string }> & { stop?: () => void }}
 */
export function playDino(opts = {}) {
  const stdin = opts.stdin ?? process.stdin;
  const stdout = opts.stdout ?? process.stdout;
  const mode = opts.mode ?? "standalone";
  const tickMs = opts.tickMs ?? TICK_MS;
  const sidecar = mode === "sidecar";

  if (!shouldOfferDino({ stdin, stdout, env: opts.env ?? process.env })) {
    const skipped = Promise.resolve({ score: 0, status: "skipped" });
    skipped.stop = () => {};
    return skipped;
  }

  const width =
    opts.width ?? Math.min(56, Math.max(32, (stdout.columns || 48) - 2));
  let state = createInitialState({
    width,
    seed: (Date.now() % 100000) + 1,
  });
  let lineCount = 0;
  let drawn = false;
  let settled = false;
  let timer = null;
  const wasRaw = Boolean(stdin.isRaw);

  const write = (s) => {
    stdout.write(s);
  };

  const clearDrawn = () => {
    if (!drawn || lineCount <= 0) return;
    write(`\x1b[${lineCount}A\r${ERASE_DOWN}`);
  };

  const draw = () => {
    const colored = paintFrame(state, { sidecar });
    if (drawn) clearDrawn();
    else drawn = true;
    write(`${colored}\n`);
    lineCount = colored.split("\n").length;
  };

  /** @type {(v: { score: number, status: string }) => void} */
  let resolvePromise = () => {};
  const promise = new Promise((resolve) => {
    resolvePromise = resolve;
  });

  const finish = (status) => {
    if (settled) return;
    settled = true;
    if (timer) clearInterval(timer);
    stdin.off("data", onData);
    try {
      stdin.setRawMode(wasRaw);
    } catch {
      // ignore
    }
    try {
      stdin.pause();
    } catch {
      // ignore
    }
    clearDrawn();
    write(CURSOR_SHOW);
    write("\r\n");
    resolvePromise({ score: state.score, status });
  };

  const onData = (chunk) => {
    if (settled) return;
    const action = parseKey(chunk);
    if (sidecar && action === "restart") return;
    state = reduceInput(state, action);
    if (state.status === "stopped") {
      draw();
      finish("stopped");
      return;
    }
    if (state.status === "over" && sidecar) {
      state = createInitialState({ width: state.width, seed: state.rng || 1 });
    }
    draw();
  };

  try {
    stdin.setRawMode(true);
  } catch {
    const skipped = Promise.resolve({ score: 0, status: "skipped" });
    skipped.stop = () => {};
    return skipped;
  }
  stdin.resume();
  write(CURSOR_HIDE);

  if (sidecar) {
    write(
      `${style.dim("Mientras tanto, un Alquimia Runner — Espacio/↑ saltá")}\n`
    );
  } else {
    write(`${style.bold("Alquimia Runner")} ${style.dim("(original TTY)")}\n`);
  }

  draw();

  timer = setInterval(() => {
    if (settled) return;
    if (state.status !== "playing") {
      if (sidecar && state.status === "over") {
        state = createInitialState({
          width: state.width,
          seed: state.rng || 1,
        });
      } else {
        return;
      }
    }
    state = step(state);
    if (state.status === "over" && sidecar) {
      draw();
      state = createInitialState({ width: state.width, seed: state.rng || 1 });
      return;
    }
    draw();
  }, tickMs);

  promise.stop = () => {
    if (settled) return;
    state = { ...state, status: "stopped" };
    draw();
    finish("stopped");
  };

  return promise;
}

/**
 * Run an async child job; if TTY/interactive, play dino in parallel.
 *
 * @template T
 * @param {(ctx: { useDino: boolean }) => Promise<T>} job
 * @param {{
 *   stdin?: NodeJS.ReadStream,
 *   stdout?: NodeJS.WriteStream,
 *   env?: NodeJS.ProcessEnv,
 *   noInteractive?: boolean,
 *   argv?: string[],
 * }} [opts]
 * @returns {Promise<{ result: T, playedDino: boolean, dinoScore: number }>}
 */
export async function runWithDino(job, opts = {}) {
  const offer = shouldOfferDino(opts);

  if (!offer) {
    const result = await job({ useDino: false });
    return { result, playedDino: false, dinoScore: 0 };
  }

  const session = playDino({
    stdin: opts.stdin ?? process.stdin,
    stdout: opts.stdout ?? process.stdout,
    mode: "sidecar",
    env: opts.env,
  });

  let result;
  try {
    result = await job({ useDino: true });
  } finally {
    if (typeof session.stop === "function") {
      session.stop();
    }
  }

  const ended = await session;
  return {
    result,
    playedDino: true,
    dinoScore: ended.score ?? 0,
  };
}
