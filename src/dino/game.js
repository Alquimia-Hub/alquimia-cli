import {
  existsSync as fsExistsSync,
  mkdirSync as fsMkdirSync,
  readFileSync as fsReadFileSync,
  writeFileSync as fsWriteFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { style } from "../style.js";

/** Braille playfield rows (each cell = 2×4 pixels). */
export const FIELD_ROWS = 16;
/** Player hitbox width in logical columns. */
export const PLAYER_W = 5;
/** Player standing height in logical units (hitbox). */
export const PLAYER_H = 3;
/** Default obstacle width / height (logical). */
export const OBSTACLE_W = 2;
export const OBSTACLE_H = 2;

/** Pixels per logical X / Y unit (braille cell is 2×4 px). */
export const PX_X = 2;
export const PX_Y = 4;

/**
 * Physics was tuned at 20 FPS (TICK_MS = 50). Target ~60 FPS and scale
 * per-tick deltas so wall-clock speed / jump arc stay similar:
 * velocities & spawn pacing ∝ DT, gravity (accel) ∝ DT².
 */
export const TARGET_FPS = 60;
export const REF_FPS = 20;
export const TICK_MS = 1000 / TARGET_FPS; // ~16.667ms ≈ 60 FPS
/** Per-tick scale vs the original 50ms tuning (20/60). */
export const DT = REF_FPS / TARGET_FPS;

export const GRAVITY = 0.75 * DT * DT;
export const JUMP_VELOCITY = 3.4 * DT;
export const BASE_SPEED = 1.15 * DT;
export const SPEED_GAIN = 0.00035 * DT;
export const SPAWN_MIN = Math.round(28 / DT);
export const SPAWN_MAX = Math.round(52 / DT);
const SPAWN_FLOOR = Math.round(18 / DT);
const INITIAL_SPAWN_IN = Math.round(22 / DT);
const DUST_FRAMES = Math.round(6 / DT);
/** Gap shrink vs speed, scaled so wall-clock match holds at TARGET_FPS. */
const SPAWN_SPEED_FACTOR = 2 / (DT * DT);

const CURSOR_HIDE = "\x1b[?25l";
const CURSOR_SHOW = "\x1b[?25h";
const ERASE_DOWN = "\x1b[0J";
const ANSI_RE = /\u001b\[[0-9;]*m/g;

const ROLE = {
  empty: 0,
  sky: 1,
  ground: 2,
  dust: 3,
  rock: 4,
  obstacle: 5,
  player: 6,
  crash: 7,
};

const ROLE_NAME = [
  "empty",
  "sky",
  "ground",
  "dust",
  "rock",
  "obstacle",
  "player",
  "crash",
];

/** Braille dot bit order for a 2×4 cell (row-major within cell). */
const BRAILLE_DOTS = [
  [0, 0, 0x01],
  [0, 1, 0x02],
  [0, 2, 0x04],
  [0, 3, 0x40],
  [1, 0, 0x08],
  [1, 1, 0x10],
  [1, 2, 0x20],
  [1, 3, 0x80],
];

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
export function createInitialState({ width = 56, seed = 1 } = {}) {
  const w = Math.max(32, Math.min(96, Math.floor(width) || 56));
  return {
    width: w,
    tick: 0,
    score: 0,
    speed: BASE_SPEED,
    /** Feet height above ground (>= 0), logical units. */
    playerY: 0,
    playerVy: 0,
    grounded: true,
    obstacles: /** @type {{ x: number, w: number, h: number, kind: string }[]} */ (
      []
    ),
    spawnIn: INITIAL_SPAWN_IN,
    status: /** @type {'playing'|'over'|'stopped'} */ ("playing"),
    rng: seed >>> 0 || 1,
    distance: 0,
    /** Landing dust frames remaining. */
    dust: 0,
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
    dust: state.dust > 0 ? state.dust - 1 : 0,
  };

  const wasGrounded = state.grounded;
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
  if (grounded && !wasGrounded) {
    next.dust = DUST_FRAMES;
  }

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
    let h;
    let w;
    let kind;
    if (roll > 0.82) {
      h = 4;
      w = 3;
      kind = "cactus_wide";
    } else if (roll > 0.62) {
      h = 4;
      w = 2;
      kind = "cactus_tall";
    } else if (roll > 0.4) {
      h = 3;
      w = 2;
      kind = "cactus";
    } else if (roll > 0.22) {
      h = 2;
      w = 3;
      kind = "rock_wide";
    } else {
      h = 2;
      w = OBSTACLE_W;
      kind = "rock";
    }
    next.obstacles.push({ x: next.width - 1, w, h, kind });
    const gap = SPAWN_MIN + Math.floor(nextRng(next) * (SPAWN_MAX - SPAWN_MIN));
    next.spawnIn = Math.max(SPAWN_FLOOR, gap - Math.floor(spd * SPAWN_SPEED_FACTOR));
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

/* ── Braille pixel canvas + original sprites ───────────────────────── */

/**
 * Parse '#' / non-space into a dense pixel bitmap (row strings).
 * @param {string[]} rows
 * @returns {boolean[][]}
 */
export function parseSprite(rows) {
  return rows.map((row) => [...row].map((ch) => ch !== "." && ch !== " "));
}

/**
 * Pack a 2×4 pixel cell into a braille character (U+2800 + mask).
 * Empty cells become a space (cleaner sky than ⠀).
 * @param {boolean[]} bits eight booleans in BRAILLE_DOTS order
 */
export function bitsToBraille(bits) {
  let mask = 0;
  for (let i = 0; i < 8; i++) {
    if (bits[i]) mask |= BRAILLE_DOTS[i][2];
  }
  if (mask === 0) return " ";
  return String.fromCharCode(0x2800 + mask);
}

/**
 * Encode a full pixel buffer into braille rows.
 * @param {Uint8Array} px
 * @param {Uint8Array} roles
 * @param {number} pw
 * @param {number} ph
 * @returns {{ chars: string[][], roles: string[][] }}
 */
export function encodeBraille(px, roles, pw, ph) {
  const cols = Math.floor(pw / 2);
  const rows = Math.floor(ph / 4);
  /** @type {string[][]} */
  const chars = Array.from({ length: rows }, () => Array(cols).fill(" "));
  /** @type {string[][]} */
  const outRoles = Array.from({ length: rows }, () => Array(cols).fill("sky"));

  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      let mask = 0;
      let best = ROLE.empty;
      for (const [dx, dy, bit] of BRAILLE_DOTS) {
        const x = cx * 2 + dx;
        const y = cy * 4 + dy;
        if (x >= pw || y >= ph) continue;
        const i = y * pw + x;
        if (px[i]) {
          mask |= bit;
          if (roles[i] > best) best = roles[i];
        }
      }
      chars[cy][cx] = mask === 0 ? " " : String.fromCharCode(0x2800 + mask);
      outRoles[cy][cx] = ROLE_NAME[best] || "sky";
    }
  }
  return { chars, roles: outRoles };
}

/* Pixel-art sprites — alchemist runner (not Chrome dino). '#' = on, '.' = off */

const PLAYER_RUN = [
  parseSprite([
    "...####.....",
    "..##..##....",
    "..######....",
    "..##.#.#....",
    "...####.....",
    "..######....",
    ".########...",
    "##.######.##",
    "..######....",
    "..######....",
    "..##..##....",
    ".##....##...",
    "##......#...",
  ]),
  parseSprite([
    "...####.....",
    "..##..##....",
    "..######....",
    "..##.#.#....",
    "...####.....",
    "..######....",
    ".#########..",
    "##.#######..",
    "..######....",
    "..######....",
    "...##.###...",
    "...##...##..",
    "...#.....##.",
  ]),
  parseSprite([
    "...####.....",
    "..##..##....",
    "..######....",
    "..##.#.#....",
    "...####.....",
    "..######....",
    ".########...",
    "##.######.##",
    "..######....",
    "..######....",
    "..##..##....",
    ".##....##...",
    "#.......##..",
  ]),
  parseSprite([
    "...####.....",
    "..##..##....",
    "..######....",
    "..##.#.#....",
    "...####.....",
    "..######....",
    "..#########.",
    "..#######.##",
    "..######....",
    "..######....",
    ".###.##.....",
    "##...##.....",
    "#.....#.....",
  ]),
];

const PLAYER_JUMP = parseSprite([
  "...####.....",
  "..##..##....",
  "..######....",
  "..##.#.#....",
  "...####.....",
  "..########..",
  ".##########.",
  "##.######.##",
  "..######....",
  "..######....",
  "...####.....",
  "...#..#.....",
  "...#..#.....",
]);

const PLAYER_CRASH = parseSprite([
  "...#..#.....",
  "..##..##....",
  "..##..##....",
  "..#.####....",
  "...####.....",
  "..########..",
  ".##########.",
  "##.######.##",
  "..######....",
  ".##....##...",
  "##......##..",
  "#........#..",
]);

const SPRITE_CACTUS = parseSprite([
  "..####..",
  ".######.",
  ".##..##.",
  ".######.",
  "##.####.",
  ".######.",
  ".######.",
  ".######.",
  ".######.",
  ".######.",
  ".######.",
  ".######.",
]);

const SPRITE_CACTUS_TALL = parseSprite([
  "...####...",
  "..######..",
  "..##..##..",
  "..######..",
  ".##.#####.",
  "#####.##..",
  "..######..",
  "..######..",
  "..######..",
  "..######..",
  "..######..",
  "..######..",
  "..######..",
  "..######..",
  "..######..",
  "..######..",
]);

const SPRITE_CACTUS_WIDE = parseSprite([
  "....####.##...",
  "...##########.",
  "..###.##.#####",
  "...##########.",
  "..#####.##.###",
  "...##########.",
  "....########..",
  "....########..",
  "....########..",
  "....########..",
  "....########..",
  "....########..",
  "....########..",
  "....########..",
]);

const SPRITE_ROCK = parseSprite([
  "...####...",
  "..######..",
  ".########.",
  "##########",
  ".########.",
  "..######..",
]);

const SPRITE_ROCK_WIDE = parseSprite([
  "....####....",
  "..########..",
  ".##########.",
  "############",
  ".####..####.",
  "..##....##..",
]);

/**
 * Multi-frame alchemist as braille glyph rows (for tests / introspection).
 * @param {boolean} grounded
 * @param {number} tick
 * @returns {string[]}
 */
export function playerGlyph(grounded, tick) {
  const bmp = grounded ? PLAYER_RUN[tick % PLAYER_RUN.length] : PLAYER_JUMP;
  return spriteToBrailleRows(bmp);
}

/**
 * @param {boolean[][]} bmp
 * @returns {string[]}
 */
export function spriteToBrailleRows(bmp) {
  const h = bmp.length;
  const w = bmp[0]?.length ?? 0;
  const ph = Math.ceil(h / 4) * 4;
  const pw = Math.ceil(w / 2) * 2;
  const px = new Uint8Array(pw * ph);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (bmp[y][x]) px[y * pw + x] = 1;
    }
  }
  const { chars } = encodeBraille(px, new Uint8Array(pw * ph), pw, ph);
  return chars.map((r) => r.join(""));
}

/**
 * @param {number} h
 * @param {number} w
 * @param {string} [kind]
 * @returns {boolean[][]}
 */
export function obstacleSprite(h, w, kind) {
  if (kind === "cactus_wide" || (w >= 3 && h >= 4)) return SPRITE_CACTUS_WIDE;
  if (kind === "cactus_tall" || h >= 4) return SPRITE_CACTUS_TALL;
  if (kind === "rock_wide" || (w >= 3 && h <= 2)) return SPRITE_ROCK_WIDE;
  if (kind === "rock" || h <= 2) return SPRITE_ROCK;
  return SPRITE_CACTUS;
}

/**
 * Legacy string glyph helper — braille rows for an obstacle.
 * @param {number} h
 * @param {number} w
 * @returns {string[]}
 */
export function obstacleGlyph(h, w) {
  return spriteToBrailleRows(obstacleSprite(h, w));
}

/**
 * @param {string} s
 */
export function visibleWidth(s) {
  return String(s).replace(ANSI_RE, "").length;
}

/**
 * Blit a sprite bitmap onto the canvas. Origin is top-left of sprite.
 * @param {Uint8Array} px
 * @param {Uint8Array} roles
 * @param {number} pw
 * @param {number} ph
 * @param {boolean[][]} bmp
 * @param {number} x0
 * @param {number} y0
 * @param {number} role
 */
function blit(px, roles, pw, ph, bmp, x0, y0, role) {
  for (let y = 0; y < bmp.length; y++) {
    const row = bmp[y];
    const gy = y0 + y;
    if (gy < 0 || gy >= ph) continue;
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue;
      const gx = x0 + x;
      if (gx < 0 || gx >= pw) continue;
      const i = gy * pw + gx;
      if (role >= roles[i]) {
        px[i] = 1;
        roles[i] = role;
      }
    }
  }
}

/**
 * Set a single pixel if in bounds / priority allows.
 * @param {Uint8Array} px
 * @param {Uint8Array} roles
 * @param {number} pw
 * @param {number} ph
 * @param {number} x
 * @param {number} y
 * @param {number} role
 */
function setPx(px, roles, pw, ph, x, y, role) {
  if (x < 0 || y < 0 || x >= pw || y >= ph) return;
  const i = y * pw + x;
  if (role >= roles[i]) {
    px[i] = 1;
    roles[i] = role;
  }
}

/**
 * Compose playfield as braille chars + role tags for coloring.
 * @param {ReturnType<typeof createInitialState>} state
 * @returns {{ chars: string[][], roles: string[][] }}
 */
function composeField(state) {
  const cols = state.width;
  const rows = FIELD_ROWS;
  const pw = cols * 2;
  const ph = rows * 4;
  const px = new Uint8Array(pw * ph);
  const roles = new Uint8Array(pw * ph);

  // Ground band: solid top edge of the bottom braille row + grit
  const groundTop = ph - 4;
  const scroll = Math.floor(state.distance * PX_X);
  for (let x = 0; x < pw; x++) {
    setPx(px, roles, pw, ph, x, groundTop, ROLE.ground);
    setPx(px, roles, pw, ph, x, groundTop + 1, ROLE.ground);
    // Subtle scrolling grit on lower dots
    const g = (x + scroll) % 11;
    if (g === 0 || g === 5) {
      setPx(px, roles, pw, ph, x, groundTop + 2, ROLE.ground);
    }
    if (g === 2) {
      setPx(px, roles, pw, ph, x, groundTop + 3, ROLE.ground);
    }
  }

  // Soft dune / horizon dust just above ground
  for (let x = 0; x < pw; x++) {
    const phase = (x + Math.floor(state.distance)) % 23;
    if (phase === 0) setPx(px, roles, pw, ph, x, groundTop - 1, ROLE.ground);
    if (phase === 11) setPx(px, roles, pw, ph, x, groundTop - 2, ROLE.sky);
  }

  // Muted sky particles (parallax)
  for (let n = 0; n < Math.floor(cols / 5); n++) {
    const seed = n * 47 + Math.floor(state.distance / 3);
    const sx = (seed * 13 + n * 17) % pw;
    const sy = 2 + ((seed * 7) % Math.max(4, groundTop - 14));
    setPx(px, roles, pw, ph, sx, sy, ROLE.sky);
    if (n % 3 === 0) {
      setPx(px, roles, pw, ph, (sx + 3) % pw, sy + 2, ROLE.sky);
    }
  }

  // Obstacles — feet sit on groundTop
  for (const ob of state.obstacles) {
    const kind =
      ob.kind ||
      (ob.w >= 3 && ob.h >= 4
        ? "cactus_wide"
        : ob.h >= 4
          ? "cactus_tall"
          : ob.w >= 3
            ? "rock_wide"
            : ob.h <= 2
              ? "rock"
              : "cactus");
    const bmp = obstacleSprite(ob.h, ob.w, kind);
    const role =
      kind.startsWith("rock") || ob.h <= 2 ? ROLE.rock : ROLE.obstacle;
    const ox = Math.round(ob.x * PX_X);
    const oy = groundTop - bmp.length;
    blit(px, roles, pw, ph, bmp, ox, oy, role);
  }

  // Landing dust puff near feet
  if (state.dust > 0 && state.grounded) {
    const feetX = 4 * PX_X + 3;
    const age = Math.round((DUST_FRAMES - state.dust) * DT);
    const puffs = [
      [feetX - 2 - age, groundTop - 1],
      [feetX + 6 + age, groundTop - 1],
      [feetX - 1 - age, groundTop - 2],
      [feetX + 5 + age, groundTop - 2],
      [feetX + age, groundTop - 1],
    ];
    for (const [dx, dy] of puffs) {
      if (state.dust >= Math.round(2 / DT) || Math.abs(dx - feetX) < 4) {
        setPx(px, roles, pw, ph, dx, dy, ROLE.dust);
      }
    }
  }

  // Player
  const liftPx = Math.max(0, Math.round(state.playerY * PX_Y));
  const crashed = state.status === "over";
  let bmp;
  if (crashed) bmp = PLAYER_CRASH;
  else if (!state.grounded) bmp = PLAYER_JUMP;
  else bmp = PLAYER_RUN[Math.floor(state.tick * DT) % PLAYER_RUN.length];
  const px0 = 4 * PX_X;
  const py0 = groundTop - bmp.length - liftPx;
  blit(
    px,
    roles,
    pw,
    ph,
    bmp,
    px0,
    py0,
    crashed ? ROLE.crash : ROLE.player
  );

  return encodeBraille(px, roles, pw, ph);
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
    case "dust":
      return style.dim(style.yellow(ch));
    case "ground":
      return style.dim(ch);
    case "sky":
      return style.dim(ch);
    default:
      return ch;
  }
}

/**
 * Render playfield rows (braille canvas). No ANSI.
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
  const shownHi = Math.max(hi, state.status === "over" ? state.score : hi);
  const hiBit = `HI ${String(shownHi).padStart(4, " ")}`;
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
    lines.push(
      paint ? style.dim(padLine(sub, w, "left")) : padLine(sub, w, "left")
    );
  }

  const plainField = renderField(state);
  const field = paint ? renderFieldColored(state, true) : plainField;

  if (state.status === "over") {
    const panelInner = Math.min(32, Math.max(24, w - 10));
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
      lines.push(
        paint ? style.dim(padLine(hint, w, "center")) : padLine(hint, w, "center")
      );
    }
  } else if (state.status === "stopped") {
    const msg = "Listo — volvemos al install/update.";
    lines.push(paint ? style.dim(msg) : msg);
  } else {
    const hint = "Espacio/↑ saltá · q/Esc salí";
    lines.push(
      paint ? style.dim(padLine(hint, w, "center")) : padLine(hint, w, "center")
    );
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
 * Register the TTY data listener used by playDino.
 * Extracted so tests can assert wiring without driving the full game loop.
 * @param {{ on?: Function, off?: Function, removeListener?: Function }} stdin
 * @param {(chunk: string | Buffer) => void} onData
 * @returns {() => void} detach
 */
export function attachDinoInput(stdin, onData) {
  if (typeof stdin?.on !== "function") {
    throw new Error('dino input requires stdin.on("data", …)');
  }
  stdin.on("data", onData);
  return () => {
    if (typeof stdin.off === "function") {
      stdin.off("data", onData);
      return;
    }
    if (typeof stdin.removeListener === "function") {
      stdin.removeListener("data", onData);
    }
  };
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
    opts.width ?? Math.min(80, Math.max(48, (stdout.columns || 64) - 2));
  let state = createInitialState({
    width,
    seed: (Date.now() % 100000) + 1,
  });
  let hiScore = loadHiScore(hiOpts);
  let lineCount = 0;
  let drawn = false;
  let settled = false;
  let timer = null;
  /** @type {() => void} */
  let detachInput = () => {};
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
    detachInput();
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
  detachInput = attachDinoInput(stdin, onData);
  write(CURSOR_HIDE);

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
