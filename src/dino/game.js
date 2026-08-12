import {
  existsSync as fsExistsSync,
  mkdirSync as fsMkdirSync,
  readFileSync as fsReadFileSync,
  writeFileSync as fsWriteFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { style } from "../style.js";

/** Rows of the playfield (excluding HUD / hints). */
export const FIELD_ROWS = 12;
/** Player hitbox width in columns. */
export const PLAYER_W = 5;
/** Player standing height in rows (hitbox; sprite may be taller). */
export const PLAYER_H = 3;
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
const ANSI_RE = /\u001b\[[0-9;]*m/g;

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
    const h = roll > 0.72 ? 4 : roll > 0.45 ? 3 : 2;
    const w = roll > 0.82 ? 3 : roll > 0.55 ? OBSTACLE_W : 2;
    next.obstacles.push({ x: next.width - 1, w, h });
    const gap = SPAWN_MIN + Math.floor(nextRng(next) * (SPAWN_MAX - SPAWN_MIN));
    next.spawnIn = Math.max(18, gap - Math.floor(spd * 2));
  }

  if (hitsObstacle(next)) {
    next.status = "over";
  }

  return next;
}

/* ── Hi-score (XDG share, next to art prefs) ───────────────────────── */

/**
 * @param {{ home?: string }} [opts]
 */
export function dinoHiScorePath({ home = homedir() } = {}) {
  return join(home, ".local", "share", "alquimia", "dino-hiscore.json");
}

/**
 * @param {{
 *   home?: string,
 *   path?: string,
 *   existsSync?: (p: string) => boolean,
 *   readFileSync?: typeof fsReadFileSync,
 * }} [opts]
 * @returns {number}
 */
export function loadHiScore(opts = {}) {
  const path = opts.path ?? dinoHiScorePath({ home: opts.home });
  const exists = opts.existsSync ?? fsExistsSync;
  const read = opts.readFileSync ?? fsReadFileSync;
  if (!exists(path)) return 0;
  try {
    const raw = JSON.parse(read(path, "utf8"));
    const n = Number(raw?.hiScore ?? raw?.score ?? 0);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

/**
 * @param {number} score
 * @param {{
 *   home?: string,
 *   path?: string,
 *   mkdirSync?: typeof fsMkdirSync,
 *   writeFileSync?: typeof fsWriteFileSync,
 *   existsSync?: (p: string) => boolean,
 *   readFileSync?: typeof fsReadFileSync,
 * }} [opts]
 * @returns {number} best score after update
 */
export function saveHiScore(score, opts = {}) {
  const n = Math.max(0, Math.floor(Number(score) || 0));
  const prev = loadHiScore(opts);
  const hi = Math.max(prev, n);
  const path = opts.path ?? dinoHiScorePath({ home: opts.home });
  const mkdir = opts.mkdirSync ?? fsMkdirSync;
  const write = opts.writeFileSync ?? fsWriteFileSync;
  mkdir(dirname(path), { recursive: true });
  write(path, `${JSON.stringify({ hiScore: hi }, null, 2)}\n`, "utf8");
  return hi;
}

/* ── Original Unicode sprites (not Chrome assets) ──────────────────── */

/**
 * Multi-row alchemist runner — half-block / box glyphs.
 * Frames: run cycle + jump pose. 4 rows × 5 cols.
 * @param {boolean} grounded
 * @param {number} tick
 * @returns {string[]}
 */
export function playerGlyph(grounded, tick) {
  if (!grounded) {
    // Jump hold — tucked legs, blink/bob on the head row
    return tick % 6 < 3
      ? [" ▄█▀▄", "▐███▌", " ▐█▌ ", "  ▀  "]
      : [" ▄█▄ ", "▐█▀█▌", " ▐█▌ ", "  ▀  "];
  }
  const phase = tick % 4;
  if (phase === 0) {
    return [" ▄█▄ ", "▐███▌", " ▐█▌ ", " ▀ ▘ "];
  }
  if (phase === 1) {
    return [" ▄█▄ ", "▐█▀█▌", " ▐█▌ ", "  ▀▀ "];
  }
  if (phase === 2) {
    return [" ▄█▄ ", "▐███▌", " ▐█▌ ", " ▝ ▀ "];
  }
  return [" ▄█▄ ", "▐█▄█▌", " ▐█▌ ", " ▀▀  "];
}
/**
 * Cacti / crystal rocks — taller than the old Y sticks.
 * @param {number} h
 * @param {number} w
 * @returns {string[]}
 */
export function obstacleGlyph(h, w) {
  const height = Math.max(2, Math.min(5, h | 0));
  const width = Math.max(2, Math.min(4, w | 0));
  /** @type {string[]} */
  const lines = [];

  if (width >= 3) {
    // Broad cactus / crystal pillar
    for (let row = 0; row < height; row++) {
      if (row === height - 1) {
        lines.push("▐█▌");
      } else if (row === height - 2) {
        lines.push("█▐█");
      } else if (row === 0) {
        lines.push(" ▓ ");
      } else {
        lines.push("▐█▌");
      }
    }
  } else {
    for (let row = 0; row < height; row++) {
      if (row === height - 1) {
        lines.push("▐▌");
      } else if (row === 0) {
        lines.push("▓▓");
      } else if (row === height - 2 && height >= 3) {
        lines.push("█▌");
      } else {
        lines.push("▐█");
      }
    }
  }

  return lines.map((l) => l.padEnd(width, " ").slice(0, width));
}

/**
 * Continuous ground with subtle scrolling grit.
 * @param {number} width
 * @param {number} distance
 */
function groundTexture(width, distance) {
  const base = "▀";
  const grit = ["▀", "▀", "▀", "▄", "▀", "▔", "▀", "▀"];
  let out = "";
  const offset = Math.floor(distance) % grit.length;
  for (let x = 0; x < width; x++) {
    const g = grit[(x + offset) % grit.length];
    out += x % 11 === offset % 11 ? g : base;
  }
  return out;
}

/**
 * @param {string} s
 */
export function visibleWidth(s) {
  return String(s).replace(ANSI_RE, "").length;
}

/**
 * Compose playfield as chars + role tags for coloring.
 * @param {ReturnType<typeof createInitialState>} state
 * @returns {{ chars: string[][], roles: string[][] }}
 */
function composeField(state) {
  /** @type {string[][]} */
  const chars = Array.from({ length: FIELD_ROWS }, () =>
    Array.from({ length: state.width }, () => " ")
  );
  /** @type {string[][]} */
  const roles = Array.from({ length: FIELD_ROWS }, () =>
    Array.from({ length: state.width }, () => "sky")
  );

  const put = (col, rowFromBottom, ch, role) => {
    const r = FIELD_ROWS - 1 - rowFromBottom;
    if (r < 0 || r >= FIELD_ROWS) return;
    if (col < 0 || col >= state.width) return;
    if (!ch || ch === " ") return;
    chars[r][col] = ch;
    roles[r][col] = role;
  };

  // Continuous baseline on the bottom row + soft dunes a row above
  const ground = groundTexture(state.width, state.distance);
  for (let x = 0; x < state.width; x++) {
    put(x, 0, ground[x], "ground");
  }
  for (let x = 0; x < state.width; x++) {
    const phase = Math.floor(state.distance * 0.5 + x) % 17;
    if (phase === 0 || phase === 8) put(x, 1, "·", "ground");
    if (phase === 4) put(x, 1, "˚", "sky");
  }

  // Sparse sky dust
  for (let x = 3; x < state.width; x += 9) {
    const yr = 3 + ((Math.floor(state.distance / 8) + x) % 4);
    const col = (x + Math.floor(state.distance / 3)) % state.width;
    if (chars[FIELD_ROWS - 1 - yr][col] === " ") {
      put(col, yr, "·", "sky");
    }
  }

  for (const ob of state.obstacles) {
    const glyph = obstacleGlyph(ob.h, ob.w);
    const role = ob.w >= 3 || ob.h >= 4 ? "obstacle" : "rock";
    for (let i = 0; i < glyph.length; i++) {
      const line = glyph[i];
      // Base rests on the ground row (overwrites baseline under the sprite)
      for (let c = 0; c < line.length; c++) {
        put(Math.floor(ob.x) + c, i, line[c], role);
      }
    }
  }

  const lift = Math.max(0, Math.round(state.playerY));
  const pGlyph = playerGlyph(state.grounded, state.tick);
  const crashed = state.status === "over";
  for (let i = 0; i < pGlyph.length; i++) {
    // Feet share the ground row when grounded — full 4-row sprite fits in FIELD_ROWS at jump peak
    const rowFromBottom = lift + (pGlyph.length - 1 - i);
    const line = pGlyph[i];
    for (let c = 0; c < line.length; c++) {
      put(4 + c, rowFromBottom, line[c], crashed ? "crash" : "player");
    }
  }

  return { chars, roles };
}

/**
 * @param {string} ch
 * @param {string} role
 * @param {boolean} color
 */
function paintCell(ch, role, color) {
  if (!color || !style.enabled || ch === " ") return ch;
  switch (role) {
    case "player":
      return style.bold(style.brightCyan(ch));
    case "crash":
      return style.bold(style.red(ch));
    case "obstacle":
      return style.brightGreen(ch);
    case "rock":
      return style.brightYellow(ch);
    case "ground":
      return style.dim(ch);
    case "sky":
      return style.dim(ch);
    default:
      return ch;
  }
}

/**
 * Render playfield rows (bottom = ground). Plain ASCII/Unicode, no ANSI.
 * @param {ReturnType<typeof createInitialState>} state
 * @returns {string[]}
 */
export function renderField(state) {
  const { chars } = composeField(state);
  return chars.map((r) => r.join(""));
}

/**
 * @param {ReturnType<typeof createInitialState>} state
 * @param {boolean} color
 */
function renderFieldColored(state, color) {
  const { chars, roles } = composeField(state);
  return chars.map((row, ri) =>
    row.map((ch, ci) => paintCell(ch, roles[ri][ci], color)).join("")
  );
}

/**
 * @param {string} text
 * @param {number} width
 * @param {'left'|'center'|'right'} [align]
 */
function padLine(text, width, align = "left") {
  const plain = text.replace(ANSI_RE, "");
  if (plain.length >= width) return plain.slice(0, width);
  const pad = width - plain.length;
  if (align === "center") {
    const left = Math.floor(pad / 2);
    return " ".repeat(left) + text + " ".repeat(pad - left);
  }
  if (align === "right") return " ".repeat(pad) + text;
  return text + " ".repeat(pad);
}

/**
 * @param {string} inner
 * @param {number} width
 * @param {(s: string) => string} [paint]
 */
function boxLine(inner, width, paint) {
  const contentW = Math.max(10, width - 2);
  const body = padLine(inner, contentW, "center");
  const line = `│${body}│`;
  return paint ? paint(line) : line;
}

/**
 * Full frame including HUD.
 * @param {ReturnType<typeof createInitialState>} state
 * @param {{ sidecar?: boolean, color?: boolean, hiScore?: number }} [opts]
 * @returns {string}
 */
export function renderFrame(state, { sidecar = false, color, hiScore = 0 } = {}) {
  const useColor = color ?? false;
  const w = state.width;
  const hi = Math.max(0, Math.floor(hiScore) || 0);
  const lines = [];
  const paint = useColor && style.enabled;

  const title = "Alquimia Runner";
  const scoreBit = `★ ${String(state.score).padStart(4, " ")}`;
  const hiBit = `HI ${String(Math.max(hi, state.status === "over" ? state.score : hi)).padStart(4, " ")}`;
  const gap = Math.max(
    1,
    w - visibleWidth(title) - visibleWidth(scoreBit) - visibleWidth(hiBit) - 2
  );
  let hud = `${title}${" ".repeat(gap)}${scoreBit}  ${hiBit}`;
  if (paint) {
    hud =
      style.bold(style.cyan(title)) +
      " ".repeat(gap) +
      style.brightYellow(scoreBit) +
      "  " +
      style.dim(hiBit);
  }
  lines.push(hud);

  const rule = "─".repeat(w);
  lines.push(paint ? style.dim(rule) : rule);

  if (sidecar && state.status === "playing") {
    const sub = "mientras instalamos…";
    lines.push(paint ? style.dim(padLine(sub, w, "left")) : padLine(sub, w, "left"));
  }

  const plainField = renderField(state);
  const field = paint ? renderFieldColored(state, true) : plainField;

  if (state.status === "over") {
    const panelInner = Math.min(30, Math.max(24, w - 8));
    const panelW = panelInner + 2;
    const left = Math.max(0, Math.floor((w - panelW) / 2));
    const record = Math.max(hi, state.score);

    /** @type {string[]} */
    const panelLines = [
      `╭${"─".repeat(panelInner)}╮`,
      boxLine("¡Chocaste!", panelW),
      boxLine("", panelW),
      boxLine(`Puntos  ${state.score}`, panelW),
      boxLine(`Récord  ${record}`, panelW),
      boxLine("", panelW),
    ];
    if (sidecar) {
      panelLines.push(boxLine("seguí · auto-restart", panelW));
    } else {
      panelLines.push(boxLine("Enter para reiniciar", panelW));
      panelLines.push(boxLine("q / Esc para salir", panelW));
    }
    panelLines.push(`╰${"─".repeat(panelInner)}╯`);

    const top = Math.max(0, Math.floor((FIELD_ROWS - panelLines.length) / 2));

    const paintedPanel = panelLines.map((l, i) => {
      if (!paint) return l;
      if (i === 1) return style.bold(style.red(l));
      if (l.includes("Puntos")) return style.bold(style.brightYellow(l));
      if (l.includes("Récord")) return style.cyan(l);
      if (i === 0 || i === panelLines.length - 1) return style.bold(style.white(l));
      return style.bold(l);
    });

    const merged = plainField.map((plainRow, ri) => {
      const pi = ri - top;
      if (pi < 0 || pi >= panelLines.length) {
        return paint ? style.dim(plainRow) : plainRow;
      }
      const panelPlain = panelLines[pi];
      const right = left + visibleWidth(panelPlain);
      const leftPart = plainRow.slice(0, left);
      const rightPart = plainRow.slice(Math.min(plainRow.length, right));
      const mid = paintedPanel[pi];
      if (paint) {
        return style.dim(leftPart) + mid + style.dim(rightPart);
      }
      return leftPart + panelPlain + rightPart;
    });
    lines.push(...merged);
  } else {
    lines.push(...field);
  }

  lines.push(paint ? style.dim(rule) : rule);

  if (state.status === "over") {
    if (!sidecar) {
      const hint = "Enter para reiniciar · q/Esc salí";
      lines.push(paint ? style.dim(padLine(hint, w, "center")) : padLine(hint, w, "center"));
    }
  } else if (state.status === "stopped") {
    const msg = "Listo — volvemos al install/update.";
    lines.push(paint ? style.dim(msg) : msg);
  } else {
    const hint = "Espacio/↑ saltá · q/Esc salí";
    lines.push(paint ? style.dim(padLine(hint, w, "center")) : padLine(hint, w, "center"));
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
 * @param {{ sidecar?: boolean, hiScore?: number }} [opts]
 */
function paintFrame(state, opts = {}) {
  return renderFrame(state, {
    sidecar: opts.sidecar,
    hiScore: opts.hiScore ?? 0,
    color: style.enabled,
  });
}

/**
 * Play interactive dino on a TTY.
 * @param {{
 *   stdin?: NodeJS.ReadStream,
 *   stdout?: NodeJS.WriteStream,
 *   mode?: 'standalone'|'sidecar',
 *   tickMs?: number,
 *   width?: number,
 *   env?: NodeJS.ProcessEnv,
 *   hiScorePath?: string,
 * }} [opts]
 * @returns {Promise<{ score: number, status: string }> & { stop?: () => void }}
 */
export function playDino(opts = {}) {
  const stdin = opts.stdin ?? process.stdin;
  const stdout = opts.stdout ?? process.stdout;
  const mode = opts.mode ?? "standalone";
  const tickMs = opts.tickMs ?? TICK_MS;
  const sidecar = mode === "sidecar";
  const hiOpts = opts.hiScorePath ? { path: opts.hiScorePath } : {};

  if (!shouldOfferDino({ stdin, stdout, env: opts.env ?? process.env })) {
    const skipped = Promise.resolve({ score: 0, status: "skipped" });
    skipped.stop = () => {};
    return skipped;
  }

  const width =
    opts.width ?? Math.min(64, Math.max(40, (stdout.columns || 56) - 2));
  let state = createInitialState({
    width,
    seed: (Date.now() % 100000) + 1,
  });
  let hiScore = loadHiScore(hiOpts);
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
    const colored = paintFrame(state, { sidecar, hiScore });
    if (drawn) clearDrawn();
    else drawn = true;
    write(`${colored}\n`);
    lineCount = colored.split("\n").length;
  };

  const noteHi = () => {
    if (state.score > hiScore) {
      hiScore = saveHiScore(state.score, hiOpts);
    }
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
    noteHi();
    clearDrawn();
    write(CURSOR_SHOW);
    write("\r\n");
    resolvePromise({ score: state.score, status });
  };

  const onData = (chunk) => {
    if (settled) return;
    const action = parseKey(chunk);
    if (sidecar && action === "restart") return;
    if (state.status === "over" && action === "restart") {
      noteHi();
    }
    state = reduceInput(state, action);
    if (state.status === "stopped") {
      draw();
      finish("stopped");
      return;
    }
    if (state.status === "over" && sidecar) {
      noteHi();
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

  // Single HUD lives inside the frame — no duplicate title above.
  if (sidecar) {
    write(
      `${style.dim("Mientras tanto, Alquimia Runner — Espacio/↑ saltá")}\n`
    );
  }

  draw();

  timer = setInterval(() => {
    if (settled) return;
    if (state.status !== "playing") {
      if (sidecar && state.status === "over") {
        noteHi();
        state = createInitialState({
          width: state.width,
          seed: state.rng || 1,
        });
      } else {
        return;
      }
    }
    state = step(state);
    if (state.status === "over") {
      noteHi();
    }
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
