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
  it("empty items → null (negative)", async () => {
    await expect(select([])).resolves.toBeNull();
    await expect(select(null)).resolves.toBeNull();
    await expect(select(undefined)).resolves.toBeNull();
  });

  it("non-TTY stdin/stdout → null (negative)", async () => {
    const stdin = createFakeStdin();
    stdin.isTTY = false;
    const stdout = createFakeStdout(80);
    await expect(
      select(["A"], { stdin, stdout })
    ).resolves.toBeNull();

    const stdin2 = createFakeStdin();
    const stdout2 = createFakeStdout(80);
    stdout2.isTTY = false;
    await expect(
      select(["A"], { stdin: stdin2, stdout: stdout2 })
    ).resolves.toBeNull();

    const stdin3 = createFakeStdin();
    delete stdin3.setRawMode;
    const stdout3 = createFakeStdout(80);
    await expect(
      select(["A"], { stdin: stdin3, stdout: stdout3 })
    ).resolves.toBeNull();
  });

  it("Enter selects initialIndex (positive)", async () => {
    const stdin = createFakeStdin();
    const stdout = createFakeStdout(80);
    const p = select(["Uno", "Dos", "Tres"], {
      stdin,
      stdout,
      initialIndex: 2,
      hint: HINT,
    });
    stdin.emit("data", Buffer.from(KEY.enter));
    await expect(p).resolves.toBe(2);
  });

  it("Enter with default initialIndex 0", async () => {
    const stdin = createFakeStdin();
    const stdout = createFakeStdout(80);
    const p = select(["Uno", "Dos"], { stdin, stdout, hint: HINT });
    stdin.emit("data", Buffer.from(KEY.enter));
    await expect(p).resolves.toBe(0);
  });

  it("clamps initialIndex into range", async () => {
    const stdin = createFakeStdin();
    const stdout = createFakeStdout(80);
    const p = select(["A", "B"], {
      stdin,
      stdout,
      initialIndex: 99,
      hint: HINT,
    });
    stdin.emit("data", Buffer.from(KEY.enter));
    await expect(p).resolves.toBe(1);

    const stdin2 = createFakeStdin();
    const stdout2 = createFakeStdout(80);
    const p2 = select(["A", "B"], {
      stdin: stdin2,
      stdout: stdout2,
      initialIndex: -3,
      hint: HINT,
    });
    stdin2.emit("data", Buffer.from(KEY.enter));
    await expect(p2).resolves.toBe(0);
  });

  it("↓ wraps from last to first", async () => {
    const stdin = createFakeStdin();
    const stdout = createFakeStdout(80);
    const p = select(["A", "B", "C"], {
      stdin,
      stdout,
      initialIndex: 2,
      hint: HINT,
    });
    stdin.emit("data", Buffer.from(KEY.down));
    stdin.emit("data", Buffer.from(KEY.enter));
    await expect(p).resolves.toBe(0);
  });

  it("↑ wraps from first to last", async () => {
    const stdin = createFakeStdin();
    const stdout = createFakeStdout(80);
    const p = select(["A", "B", "C"], { stdin, stdout, hint: HINT });
    stdin.emit("data", Buffer.from(KEY.up));
    stdin.emit("data", Buffer.from(KEY.enter));
    await expect(p).resolves.toBe(2);
  });

  it("alternate CSI forms ESC O A/B also navigate", async () => {
    const stdin = createFakeStdin();
    const stdout = createFakeStdout(80);
    const p = select(["A", "B", "C"], { stdin, stdout, hint: HINT });
    stdin.emit("data", Buffer.from(KEY.downAlt)); // ESC O B
    stdin.emit("data", Buffer.from(KEY.enter));
    await expect(p).resolves.toBe(1);
  });

  it("q / Esc / Ctrl+C → null (cancel)", async () => {
    {
      const stdin = createFakeStdin();
      const stdout = createFakeStdout(80);
      const p = select(["Uno", "Dos"], { stdin, stdout });
      stdin.emit("data", Buffer.from(KEY.q));
      await expect(p).resolves.toBeNull();
    }
    {
      const stdin = createFakeStdin();
      const stdout = createFakeStdout(80);
      const p = select(["Uno", "Dos"], { stdin, stdout });
      stdin.emit("data", Buffer.from("Q"));
      await expect(p).resolves.toBeNull();
    }
    {
      const stdin = createFakeStdin();
      const stdout = createFakeStdout(80);
      const p = select(["Uno", "Dos"], { stdin, stdout });
      stdin.emit("data", Buffer.from(KEY.esc));
      await expect(p).resolves.toBeNull();
    }
    {
      const stdin = createFakeStdin();
      const stdout = createFakeStdout(80);
      const p = select(["Uno", "Dos"], { stdin, stdout });
      stdin.emit("data", Buffer.from(KEY.ctrlC));
      await expect(p).resolves.toBeNull();
    }
  });

  it("custom hint and renderItem appear in the frame", async () => {
    const customHint = "custom-hint-xyz";
    const term = new VisibleTerminal(80);
    const stdin = createFakeStdin();
    const stdout = createFakeStdout(80, term);
    const p = select(["Alpha", "Beta"], {
      stdin,
      stdout,
      hint: customHint,
      renderItem: (item, _i, selected) =>
        selected ? `>> ${item} <<` : `-- ${item}`,
    });
    const mid = term.visibleText();
    expect(mid).toContain(customHint);
    expect(mid).toContain(">> Alpha <<");
    expect(mid).toContain("-- Beta");
    expect(mid).not.toContain("❯");
    stdin.emit("data", Buffer.from(KEY.enter));
    await expect(p).resolves.toBe(0);
  });

  it("Enter returns the selected index after ↓", async () => {
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

  it("stacking regression: many ↓ (12+) still one frame / no unbounded hints", async () => {
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

  it("narrow columns (40) with multi-line name+blurb — redraw stays clean", async () => {
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

  it("rapid redraw does not throw", async () => {
    const stdin = createFakeStdin();
    const stdout = createFakeStdout(80);
    const p = select(["A", "B", "C", "D", "E"], {
      stdin,
      stdout,
      hint: HINT,
      renderItem: sectionRenderItem,
    });

    expect(() => {
      for (let i = 0; i < 40; i++) {
        stdin.emit("data", Buffer.from(i % 2 === 0 ? KEY.down : KEY.up));
      }
    }).not.toThrow();

    stdin.emit("data", Buffer.from(KEY.enter));
    await expect(p).resolves.toBeTypeOf("number");
  });

  it("resize while open redraws without throwing", async () => {
    const stdin = createFakeStdin();
    const stdout = createFakeStdout(80);
    const p = select(["A", "B"], { stdin, stdout, hint: HINT });
    expect(() => {
      stdout.columns = 40;
      stdout.emit("resize");
      stdout.columns = 120;
      stdout.emit("resize");
    }).not.toThrow();
    stdin.emit("data", Buffer.from(KEY.enter));
    await expect(p).resolves.toBe(0);
  });
});
