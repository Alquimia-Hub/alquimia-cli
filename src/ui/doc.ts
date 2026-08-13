/**
 * Document model shared by every screen.
 *
 * A view builds an array of blocks once; two backends consume it:
 *   - `src/ui/kit.ts`  → OpenTUI renderables (interactive terminal)
 *   - `toPlainLines()` → plain text (pipes, non-TTY, CI)
 *
 * This is why `alquimia info` looks rich in a terminal and stays greppable
 * when piped, without any view being written twice.
 */

import { plainOf, type Styleable } from "./style.ts";

/** Semantic color names resolved by `src/ui/theme.ts`. */
export type Tone =
  | "default"
  | "muted"
  | "faint"
  | "accent"
  | "brand"
  | "good"
  | "warn"
  | "bad";

export interface Span {
  text: string;
  tone?: Tone;
}

export interface BlankBlock {
  t: "blank";
}
export interface BannerBlock {
  t: "banner";
}
export interface HeadingBlock {
  t: "heading";
  text: string;
}
export interface TextBlock {
  t: "text";
  text: string;
  tone?: Tone;
}
export interface RichBlock {
  t: "rich";
  value: Styleable;
}
export interface KvRow {
  key: string;
  value: string;
  keyTone?: Tone;
  valueTone?: Tone;
}
export interface KvBlock {
  t: "kv";
  rows: KvRow[];
}
export interface ItemBlock {
  t: "item";
  marker?: string;
  markerTone?: Tone;
  title: string;
  titleTone?: Tone;
  tag?: string;
  tagTone?: Tone;
  lines?: (string | Span)[];
}
export interface PanelBlock {
  t: "panel";
  title?: string;
  blocks: Block[];
}

export type Block =
  | BlankBlock
  | BannerBlock
  | HeadingBlock
  | TextBlock
  | RichBlock
  | KvBlock
  | ItemBlock
  | PanelBlock;

export const blank = (): BlankBlock => ({ t: "blank" });

export const heading = (text: string): HeadingBlock => ({ t: "heading", text });

export const text = (text_: string, tone?: Tone): TextBlock => ({
  t: "text",
  text: text_,
  tone,
});

/** Big brand wordmark. Rendered as ASCII art in the terminal, skipped in pipes. */
export const banner = (): BannerBlock => ({ t: "banner" });

/**
 * A pre-styled line built with OpenTUI's `t` template (see `src/ui/style.ts`).
 */
export const rich = (value: Styleable): RichBlock => ({ t: "rich", value });

/** Aligned two-column rows (command lists, link lists, doctor checks). */
export const kv = (rows: KvRow[]): KvBlock => ({ t: "kv", rows });

/** A bullet entry with an optional tag and indented detail lines. */
export const item = (opts: Omit<ItemBlock, "t">): ItemBlock => ({
  t: "item",
  ...opts,
});

/** Bordered panel wrapping nested blocks. */
export const panel = (opts: Omit<PanelBlock, "t">): PanelBlock => ({
  t: "panel",
  ...opts,
});

function spanOf(line: string | Span): Span {
  return typeof line === "string" ? { text: line } : line;
}

function padEnd(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

/**
 * Render blocks as plain text. No ANSI, no banner — safe for pipes and files.
 */
export function toPlainLines(
  blocks: readonly Block[],
  { indent = "" }: { indent?: string } = {},
): string[] {
  const out: string[] = [];

  for (const block of blocks) {
    if (!block) continue;

    switch (block.t) {
      case "banner":
        break;

      case "blank":
        out.push("");
        break;

      case "heading":
        out.push(`${indent}${block.text}`);
        break;

      case "text":
        out.push(`${indent}${block.text}`);
        break;

      case "rich":
        out.push(`${indent}${plainOf(block.value)}`);
        break;

      case "kv": {
        const width = Math.max(0, ...block.rows.map((r) => r.key.length));
        for (const row of block.rows) {
          out.push(`${indent}  ${padEnd(row.key, width)}  ${row.value}`);
        }
        break;
      }

      case "item": {
        const marker = block.marker ?? "·";
        const tag = block.tag ? `  ${block.tag}` : "";
        out.push(`${indent}  ${marker} ${block.title}${tag}`);
        for (const line of block.lines ?? []) {
          out.push(`${indent}    ${spanOf(line).text}`);
        }
        break;
      }

      case "panel": {
        if (block.title) out.push(`${indent}${block.title}`);
        out.push(...toPlainLines(block.blocks, { indent: `${indent}  ` }));
        break;
      }

      default:
        break;
    }
  }

  return out;
}

/**
 * Convenience: plain text for a whole document, leading/trailing blanks trimmed.
 */
export function toPlainText(blocks: readonly Block[]): string {
  const lines = toPlainLines(blocks);
  // The banner is skipped in plain mode; drop the blank line that followed it.
  while (lines.length && lines[0] === "") lines.shift();
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}
