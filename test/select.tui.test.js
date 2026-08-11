import { describe, it, expect } from "vitest";
import { select } from "../src/select.js";
import {
  VisibleTerminal,
  createFakeStdin,
  createFakeStdout,
  KEY,
} from "./helpers/fake-tty.js";

const HINT = "↑↓ para elegir · Enter · q";

/** Multi-line renderItem shaped like `alquimia tools` section picker. */
function sectionRenderItem(item, _index, selected) {
  // Blurb must not echo the label — tests count label occurrences.
  const blurb = "Pack recomendado por la comunidad";
  if (selected) {
    return `❯ ${item}\n    ${blurb}`;
  }
  return `  ${item}\n    ${blurb}`;
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let n = 0;
  let i = 0;
  while ((i = haystack.indexOf(needle, i)) !== -1) {
    n += 1;
    i += needle.length;
  }
  return n;
}

describe("select() TUI with fake TTY", () => {
  it("Enter returns the selected index; q cancels with null", async () => {
    const stdin = createFakeStdin();
    const stdout = createFakeStdout(80);
    const p = select(["Uno", "Dos", "Tres"], {
      stdin,
      stdout,
      hint: HINT,
    });
    stdin.emit("data", Buffer.from(KEY.down));
    stdin.emit("data", Buffer.from(KEY.enter));
    await expect(p).resolves.toBe(1);

    const stdin2 = createFakeStdin();
    const stdout2 = createFakeStdout(80);
    const p2 = select(["Uno", "Dos"], { stdin: stdin2, stdout: stdout2 });
    stdin2.emit("data", Buffer.from(KEY.q));
    await expect(p2).resolves.toBeNull();
  });

  it("↑ wraps around the list", async () => {
    const stdin = createFakeStdin();
    const stdout = createFakeStdout(80);
    const p = select(["A", "B", "C"], { stdin, stdout, hint: HINT });
    stdin.emit("data", Buffer.from(KEY.up));
    stdin.emit("data", Buffer.from(KEY.enter));
    await expect(p).resolves.toBe(2);
  });

  it("does not use DECSC/DECRC (ESC 7 / ESC 8) for redraw", async () => {
    const stdin = createFakeStdin();
    const stdout = createFakeStdout(80);
    const p = select(["A", "B", "C"], { stdin, stdout, hint: HINT });
    stdin.emit("data", Buffer.from(KEY.down));
    stdin.emit("data", Buffer.from(KEY.down));
    stdin.emit("data", Buffer.from(KEY.enter));
    await p;
    const raw = stdout.raw();
    expect(raw).not.toContain("\x1b7");
    expect(raw).not.toContain("\x1b8");
    // Portable clear: cursor-up + erase-down between frames
    expect(raw).toMatch(/\x1b\[\d+A\r\x1b\[0J/);
  });

  it("regression: several ↓ redraws never stack full menus (cols 80)", async () => {
    const labels = ["Terminal", "Agents", "Skills", "Design", "Testing"];
    const term = new VisibleTerminal(80);
    const stdin = createFakeStdin();
    const stdout = createFakeStdout(80, term);

    const p = select(labels, {
      stdin,
      stdout,
      hint: HINT,
      renderItem: sectionRenderItem,
    });

    // Hammer ↓ like a user in VS Code / Cursor integrated terminal.
    for (let i = 0; i < 12; i++) {
      stdin.emit("data", Buffer.from(KEY.down));
    }
    stdin.emit("data", Buffer.from(KEY.enter));
    const idx = await p;
    expect(idx).toBe(12 % labels.length);

    const visible = term.visibleText();
    // After cleanup the picker is erased; stacking would leave ghost menus.
    for (const label of labels) {
      expect(countOccurrences(visible, label)).toBe(0);
    }
    expect(countOccurrences(visible, HINT)).toBe(0);

    // Raw stream: each redraw after the first must clear via CUP-up + erase.
    const clears = stdout.raw().match(/\x1b\[\d+A\r\x1b\[0J/g) || [];
    expect(clears.length).toBeGreaterThanOrEqual(12); // 12 downs (+ cleanup)
  });

  it("regression: narrow columns (~40) with wrapping blurbs do not stack", async () => {
    const labels = ["Herramientas de terminal", "Agents", "Skills"];
    const cols = 40;
    const term = new VisibleTerminal(cols);
    const stdin = createFakeStdin();
    const stdout = createFakeStdout(cols, term);

    const p = select(labels, {
      stdin,
      stdout,
      hint: HINT,
      renderItem: (item, _i, selected) => {
        const blurb =
          "Recomendaciones de la comunidad con blurb largo que envuelve";
        return selected
          ? `❯ ${item}\n    ${blurb}`
          : `  ${item}\n    ${blurb}`;
      },
    });

    for (let i = 0; i < 8; i++) {
      stdin.emit("data", Buffer.from(KEY.down));
    }
    stdin.emit("data", Buffer.from(KEY.q));
    await expect(p).resolves.toBeNull();

    const visible = term.visibleText();
    for (const label of labels) {
      expect(countOccurrences(visible, label)).toBeLessThanOrEqual(1);
    }
    // Hint must not appear once per redraw (the screenshot bug).
    expect(countOccurrences(visible, "↑↓")).toBeLessThanOrEqual(1);
  });

  it("mid-navigation visible frame shows exactly one hint (before cleanup)", async () => {
    const labels = ["Alpha", "Beta", "Gamma"];
    const term = new VisibleTerminal(80);
    const stdin = createFakeStdin();
    const stdout = createFakeStdout(80, term);

    const p = select(labels, {
      stdin,
      stdout,
      hint: HINT,
      renderItem: sectionRenderItem,
    });

    stdin.emit("data", Buffer.from(KEY.down));
    stdin.emit("data", Buffer.from(KEY.down));
    // Inspect before Enter/cleanup clears the picker.
    const mid = term.visibleText();
    expect(countOccurrences(mid, HINT)).toBe(1);
    expect(countOccurrences(mid, "Alpha")).toBe(1);
    expect(countOccurrences(mid, "Beta")).toBe(1);
    expect(countOccurrences(mid, "Gamma")).toBe(1);
    // Selected cursor glyph once
    expect(countOccurrences(mid, "❯")).toBe(1);

    stdin.emit("data", Buffer.from(KEY.enter));
    await expect(p).resolves.toBe(2);
  });
});
