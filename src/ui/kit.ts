/**
 * OpenTUI backend for the document model in `src/ui/doc.ts`.
 *
 * Everything here returns OpenTUI constructs (VNodes), so blocks compose the
 * same way whether they end up in a scrollback snapshot or a full-screen app.
 */

import { ASCIIFont, Box, Text, TextAttributes, type VChild } from "@opentui/core";
import type { Block, ItemBlock, Span } from "./doc.ts";
import { border, palette, toneColor } from "./theme.ts";

/** Triangle mark under the wordmark — the Alquimia brand glyph. */
const TRIANGLE = ["    /\\", "   /  \\", "  / .  \\", " /______\\"];

/** Brand banner: ASCII wordmark + triangle. */
export function Banner({ compact = false }: { compact?: boolean } = {}): VChild {
  const children: VChild[] = [
    ASCIIFont({
      text: "ALQUIMIA",
      font: "tiny",
      color: palette.gold,
    }),
  ];

  if (!compact) {
    children.push(
      Box(
        { flexDirection: "column" },
        ...TRIANGLE.map((line) =>
          Text({ content: line, fg: palette.faint, selectable: false }),
        ),
      ),
    );
  }

  return Box({ flexDirection: "column" }, ...children);
}

function padEnd(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

function spanOf(line: string | Span): Span {
  return typeof line === "string" ? { text: line } : line;
}

function renderItem(block: ItemBlock): VChild {
  const head = Box(
    { flexDirection: "row" },
    Text({
      content: `${block.marker ?? "·"} `,
      fg: toneColor(block.markerTone ?? "good"),
    }),
    Text({
      content: block.title,
      fg: toneColor(block.titleTone ?? "default"),
      attributes: TextAttributes.BOLD,
    }),
    block.tag
      ? Text({ content: `  ${block.tag}`, fg: toneColor(block.tagTone ?? "warn") })
      : null,
  );

  const detail = (block.lines ?? []).map((line) => {
    const span = spanOf(line);
    return Text({ content: span.text, fg: toneColor(span.tone ?? "muted") });
  });

  return Box(
    { flexDirection: "column", paddingLeft: 2 },
    head,
    detail.length ? Box({ flexDirection: "column", paddingLeft: 2 }, ...detail) : null,
  );
}

/** Turn one document block into a VNode. */
function renderBlock(block: Block): VChild {
  if (!block) return null;

  switch (block.t) {
    case "banner":
      return Banner();

    case "blank":
      return Text({ content: "", selectable: false });

    case "heading":
      return Text({
        content: block.text,
        fg: palette.cream,
        attributes: TextAttributes.BOLD,
      });

    case "text":
      return Text({ content: block.text, fg: toneColor(block.tone) });

    case "rich":
      return Text({ content: block.value, fg: toneColor("default") });

    case "kv": {
      // The key column is fixed and never shrinks; only the value wraps.
      // Without flexShrink: 0 Yoga squeezes the keys and the columns go ragged.
      const width = Math.max(0, ...block.rows.map((r) => r.key.length));
      return Box(
        { flexDirection: "column", paddingLeft: 2 },
        ...block.rows.map((row) =>
          Box(
            { flexDirection: "row", gap: 2 },
            Text({
              content: padEnd(row.key, width),
              fg: toneColor(row.keyTone ?? "accent"),
              width,
              flexShrink: 0,
            }),
            Text({
              content: row.value,
              fg: toneColor(row.valueTone ?? "muted"),
              flexGrow: 1,
              flexShrink: 1,
            }),
          ),
        ),
      );
    }

    case "item":
      return renderItem(block);

    case "panel":
      return Box(
        {
          flexDirection: "column",
          borderStyle: border.style,
          borderColor: border.color,
          title: block.title,
          titleColor: palette.cream,
          paddingLeft: 1,
          paddingRight: 1,
        },
        ...renderBlocks(block.blocks),
      );

    default:
      return null;
  }
}

export function renderBlocks(blocks: readonly Block[]): VChild[] {
  return blocks.map(renderBlock).filter(Boolean);
}

/**
 * Root container for a document. Used by both the scrollback and
 * full-screen paths.
 */
export function Document(
  blocks: readonly Block[],
  { paddingLeft = 1 }: { paddingLeft?: number } = {},
): VChild {
  return Box(
    { flexDirection: "column", width: "100%", paddingLeft },
    ...renderBlocks(blocks),
  );
}

/** Footer hint line ("↑↓ · Enter · Esc"). */
export function Hint(hint: string): VChild {
  return Text({ content: hint, fg: palette.faint, selectable: false });
}
