/**
 * Brand palette + tone tokens.
 *
 * Every color in the CLI comes from here. OpenTUI accepts hex strings
 * anywhere a `ColorInput` is expected, so views pass these straight through
 * to `fg` / `borderColor` / `color` props.
 */

import type { BorderStyle } from "@opentui/core";
import type { Tone } from "./doc.ts";

export const palette = {
  gold: "#E8B84B",
  cream: "#F3E3C3",
  cyan: "#5BC8CF",
  green: "#6FCF7F",
  amber: "#F2C14E",
  red: "#E5534B",
  muted: "#8A8A96",
  faint: "#5A5A66",
  white: "#EDEDF2",
} as const;

/** Semantic tones used by the document model. Views name a tone, never a hex. */
export const tones: Record<Tone, string> = {
  default: palette.white,
  muted: palette.muted,
  faint: palette.faint,
  accent: palette.cyan,
  brand: palette.gold,
  good: palette.green,
  warn: palette.amber,
  bad: palette.red,
};

export function toneColor(tone?: Tone): string {
  return tones[tone ?? "default"] ?? tones.default;
}

/** Border treatment shared by every panel/frame in the CLI. */
export const border: { style: BorderStyle; color: string } = {
  style: "rounded",
  color: palette.faint,
};

/** Colors for the Alquimia Runner playfield, keyed by the engine's role names. */
export const dinoRoles: Record<string, string> = {
  player: palette.cyan,
  crash: palette.red,
  obstacle: palette.green,
  rock: palette.amber,
  dust: palette.faint,
  ground: palette.muted,
  sky: palette.faint,
  empty: palette.faint,
};
