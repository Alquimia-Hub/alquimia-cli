/**
 * Interactive pickers, mounted into an already-running renderer.
 *
 * The `SelectRenderable` is deliberately left unfocused and driven manually:
 * OpenTUI's focused Select binds `j`/`k` to navigation, which would swallow
 * those letters from the type-to-filter box. Manual routing keeps arrows for
 * movement and every printable key for filtering.
 */

import {
  BoxRenderable,
  SelectRenderable,
  Text,
  TextAttributes,
  TextRenderable,
  type CliRenderer,
  type KeyEvent,
  type SelectOption,
} from "@opentui/core";
import { Banner } from "./kit.ts";
import { border, palette } from "./theme.ts";

/** One row in a picker. `value` carries whatever the caller needs back. */
export interface PickerOption<T = unknown> {
  name: string;
  description?: string;
  /** Extra text matched by the type-to-filter box but never displayed. */
  filterText?: string;
  value?: T;
}

export interface PickerResult<T = unknown> {
  index: number;
  option: PickerOption<T>;
}

export interface PromptSelectOptions<T = unknown> {
  title?: string;
  subtitle?: string;
  options: PickerOption<T>[];
  hint?: string;
  filterable?: boolean;
  initialIndex?: number;
  banner?: boolean;
}

export const HINT_FILTER =
  "↑↓ elegí · Enter abrí · escribí para filtrar · Esc limpia/vuelve";
export const HINT_SIMPLE = "↑↓ elegí · Enter confirmá · Esc/q volvé";

let pickerSeq = 0;

/**
 * OpenTUI's `SelectOption.description` is required; ours is optional because
 * plenty of rows have nothing extra to say. Normalize at the boundary.
 */
function toSelectOptions(list: readonly PickerOption<any>[]): SelectOption[] {
  return list.map((o) => ({ name: o.name, description: o.description ?? "" }));
}

function matches(option: PickerOption, query: string): boolean {
  if (!query) return true;
  const haystack = `${option.name} ${option.description ?? ""} ${option.filterText ?? ""}`;
  return haystack.toLowerCase().includes(query.toLowerCase());
}

/**
 * Show a select prompt and resolve with the chosen option, or `null` when the
 * user cancels.
 */
export function promptSelect<T = unknown>(
  renderer: CliRenderer,
  opts: PromptSelectOptions<T>,
): Promise<PickerResult<T> | null> {
  const {
    title,
    subtitle,
    options,
    filterable = false,
    hint = filterable ? HINT_FILTER : HINT_SIMPLE,
    initialIndex = 0,
    banner = true,
  } = opts;

  return new Promise<PickerResult<T> | null>((resolve) => {
    const id = `picker-${pickerSeq++}`;
    let query = "";
    let visible = options.slice();

    const root = new BoxRenderable(renderer, {
      id,
      flexDirection: "column",
      width: "100%",
      height: "100%",
      paddingLeft: 1,
      paddingRight: 1,
      paddingTop: 1,
    });

    if (banner) root.add(Banner({ compact: true }));
    if (title) {
      root.add(
        Text({ content: title, fg: palette.cream, attributes: TextAttributes.BOLD }),
      );
    }
    if (subtitle) root.add(Text({ content: subtitle, fg: palette.muted }));
    root.add(Text({ content: "" }));

    const filterLine = new TextRenderable(renderer, {
      id: `${id}-filter`,
      content: "",
      fg: palette.cyan,
    });
    root.add(filterLine);

    const select = new SelectRenderable(renderer, {
      id: `${id}-select`,
      flexGrow: 1,
      width: "100%",
      options: toSelectOptions(visible),
      showDescription: true,
      showScrollIndicator: true,
      wrapSelection: true,
      backgroundColor: "transparent",
      focusedBackgroundColor: "transparent",
      textColor: palette.white,
      selectedTextColor: palette.gold,
      selectedBackgroundColor: "#1E1E26",
      descriptionColor: palette.faint,
      selectedDescriptionColor: palette.muted,
    });
    select.setSelectedIndex(
      Math.min(Math.max(0, initialIndex), Math.max(0, visible.length - 1)),
    );
    root.add(select);

    const hintBox = new BoxRenderable(renderer, {
      id: `${id}-hint`,
      borderStyle: border.style,
      borderColor: border.color,
      paddingLeft: 1,
      paddingRight: 1,
      flexShrink: 0,
    });
    hintBox.add(Text({ content: hint, fg: palette.faint }));
    root.add(hintBox);

    renderer.root.add(root);

    const refresh = () => {
      visible = options.filter((o) => matches(o, query));
      select.options = toSelectOptions(visible);
      if (select.getSelectedIndex() >= visible.length) {
        select.setSelectedIndex(Math.max(0, visible.length - 1));
      }
      filterLine.content = query ? `Filtro: ${query}` : "";
    };

    let finished = false;
    const finish = (result: PickerResult<T> | null) => {
      if (finished) return;
      finished = true;
      renderer.keyInput.off("keypress", onKey);
      try {
        renderer.root.remove(root);
      } catch {
        // Renderer already tearing down.
      }
      resolve(result);
    };

    const onKey = (key: KeyEvent) => {
      if (key.ctrl && key.name === "c") {
        finish(null);
        return;
      }

      switch (key.name) {
        case "up":
          select.moveUp();
          return;
        case "down":
          select.moveDown();
          return;
        case "pageup":
          select.moveUp(5);
          return;
        case "pagedown":
          select.moveDown(5);
          return;
        case "return":
        case "enter": {
          const option = visible[select.getSelectedIndex()];
          if (!option) return;
          finish({ index: options.indexOf(option), option });
          return;
        }
        case "escape":
          if (filterable && query) {
            query = "";
            refresh();
            return;
          }
          finish(null);
          return;
        case "backspace":
          if (filterable && query) {
            query = query.slice(0, -1);
            refresh();
          }
          return;
        default:
          break;
      }

      if (key.ctrl || key.meta) return;

      if (filterable) {
        if (key.sequence && key.sequence.length === 1 && key.sequence >= " ") {
          query += key.sequence;
          refresh();
        }
        return;
      }

      if (key.name === "q") finish(null);
    };

    renderer.keyInput.on("keypress", onKey);
    refresh();
  });
}

export interface PromptConfirmOptions {
  title: string;
  subtitle?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  detail?: string;
}

/** Yes/no confirmation built on the same picker. */
export async function promptConfirm(
  renderer: CliRenderer,
  opts: PromptConfirmOptions,
): Promise<boolean> {
  const picked = await promptSelect(renderer, {
    title: opts.title,
    subtitle: opts.subtitle,
    banner: false,
    options: [
      { name: opts.confirmLabel ?? "Ejecutar", description: opts.detail ?? "" },
      { name: opts.cancelLabel ?? "Cancelar", description: "Volvé sin hacer nada" },
    ],
    hint: HINT_SIMPLE,
  });

  return picked?.index === 0;
}
