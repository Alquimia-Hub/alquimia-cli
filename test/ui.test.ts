import { describe, it, expect } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";

import * as doc from "../src/ui/doc.ts";
import type { Block } from "../src/ui/doc.ts";
import { Document } from "../src/ui/kit.ts";
import { isInteractive } from "../src/ui/app.ts";
import { promptConfirm, promptSelect } from "../src/ui/picker.ts";
import { plainOf, style, t } from "../src/ui/style.ts";
import {
  eventOptions,
  eventsView,
  helpView,
  homeOptions,
  infoView,
  sectionOptions,
  toolOptions,
  toolsView,
} from "../src/ui/views.ts";
import { toolSections } from "../src/tools.ts";

/** Render blocks through a real (in-memory) renderer and return the text frame. */
async function renderBlocks(
  blocks: Block[],
  { width = 80, height = 40 } = {},
): Promise<string> {
  const setup = await createTestRenderer({ width, height });
  try {
    setup.renderer.root.add(Document(blocks));
    await setup.renderOnce();
    return setup.captureCharFrame();
  } finally {
    setup.renderer.destroy();
  }
}

describe("ui/style — StyledText", () => {
  it("style helpers produce chunks that `t` composes", () => {
    const value = t`${style.green("✓")} Listo — ${style.bold("gh")} instalado.`;
    expect(value.chunks.length).toBeGreaterThan(1);
    expect(plainOf(value)).toBe("✓ Listo — gh instalado.");
  });

  it("plainOf passes strings through and tolerates nullish", () => {
    expect(plainOf("hola")).toBe("hola");
    expect(plainOf(null)).toBe("");
    expect(plainOf(undefined)).toBe("");
  });
});

describe("ui/doc — plain text backend", () => {
  it("renders each block type without ANSI", () => {
    const lines = doc.toPlainLines([
      doc.banner(),
      doc.heading("Redes"),
      doc.kv([{ key: "Web", value: "https://alquimia.community/" }]),
      doc.item({
        marker: "·",
        title: "gh",
        tag: "(install)",
        lines: ["GitHub desde la terminal"],
      }),
      doc.rich(t`${style.green("✓")} ok`),
      doc.blank(),
    ]);

    // The banner is terminal-only; pipes get clean text.
    expect(lines).toEqual([
      "Redes",
      "  Web  https://alquimia.community/",
      "  · gh  (install)",
      "    GitHub desde la terminal",
      "✓ ok",
      "",
    ]);
    expect(lines.join("\n")).not.toMatch(/\[/);
  });

  it("toPlainText trims trailing blanks", () => {
    expect(doc.toPlainText([doc.text("uno"), doc.blank(), doc.blank()])).toBe("uno");
  });

  it("panels indent their nested blocks", () => {
    const lines = doc.toPlainLines([
      doc.panel({ title: "Uso", blocks: [doc.text("alquimia help")] }),
    ]);
    expect(lines).toEqual(["Uso", "  alquimia help"]);
  });
});

describe("ui/kit — OpenTUI backend", () => {
  it("renders the help view with banner, usage and commands", async () => {
    const frame = await renderBlocks(helpView(), { width: 84, height: 46 });
    expect(frame).toMatch(/Uso/);
    expect(frame).toMatch(/Comandos/);
    expect(frame).toMatch(/alquimia \[comando\] \[opciones\]/);
    expect(frame).toMatch(/completion <zsh\|bash\|fish>/);
    // ASCII wordmark from ASCIIFont plus the triangle mark.
    expect(frame).toMatch(/▀|▄/);
    expect(frame).toMatch(/\/______\\/);
  });

  it("aligns the kv column instead of ragged-wrapping it", async () => {
    const frame = await renderBlocks(infoView({ noBanner: true }), {
      width: 96,
      height: 40,
    });
    const rows = frame
      .split("\n")
      .filter((line) => /https:\/\//.test(line) && /^\s+\w/.test(line));
    expect(rows.length).toBeGreaterThanOrEqual(4);
    const columns = rows.map((line) => line.indexOf("https://"));
    expect(new Set(columns).size).toBe(1);
  });

  it("marks the next community call", async () => {
    const frame = await renderBlocks(eventsView({ noBanner: true }), {
      width: 80,
      height: 30,
    });
    expect(frame).toMatch(/Community calls/);
    expect(frame).toMatch(/\(próxima\)/);
    expect(frame).toMatch(/→/);
  });

  it("lists tools with install metadata", async () => {
    const section = toolSections.find((s) => s.id === "terminal");
    const frame = await renderBlocks(toolsView({ noBanner: true, section }), {
      width: 90,
      height: 46,
    });
    expect(frame).toMatch(/Catálogo de tools/);
    expect(frame).toMatch(/id: terminal/);
    expect(frame).toMatch(/install global:/);
  });
});

describe("ui/picker — promptSelect", () => {
  it("filters as you type and resolves the picked option", async () => {
    const setup = await createTestRenderer({ width: 76, height: 22 });
    try {
      const pending = promptSelect(setup.renderer, {
        title: "Catálogo de tools",
        options: sectionOptions(),
        filterable: true,
      });
      await setup.renderOnce();
      expect(setup.captureCharFrame()).toMatch(/Herramientas de terminal/);

      await setup.mockInput.typeText("agen");
      await setup.renderOnce();

      const filtered = setup.captureCharFrame();
      expect(filtered).toMatch(/Filtro: agen/);
      expect(filtered).toMatch(/Herramientas de agentes/);
      expect(filtered).not.toMatch(/Herramientas de terminal/);

      setup.mockInput.pressEnter();
      const picked = await pending;
      expect(picked?.option.value?.id).toBe("agents");
    } finally {
      setup.renderer.destroy();
    }
  });

  it("keeps `j` and `k` as filter input, not navigation", async () => {
    const setup = await createTestRenderer({ width: 76, height: 20 });
    try {
      const pending = promptSelect(setup.renderer, {
        options: [
          { name: "jq", description: "JSON" },
          { name: "kubectl", description: "k8s" },
          { name: "ripgrep", description: "search" },
        ],
        filterable: true,
      });
      await setup.renderOnce();

      await setup.mockInput.typeText("j");
      await setup.renderOnce();
      const frame = setup.captureCharFrame();
      expect(frame).toMatch(/Filtro: j/);
      expect(frame).toMatch(/jq/);
      expect(frame).not.toMatch(/ripgrep/);

      setup.mockInput.pressEnter();
      expect((await pending)?.option.name).toBe("jq");
    } finally {
      setup.renderer.destroy();
    }
  });

  it("Esc clears an active filter before cancelling", async () => {
    // Kitty keyboard disambiguates a lone ESC; without it the terminal cannot
    // tell "user pressed Escape" from "start of an escape sequence".
    const setup = await createTestRenderer({ width: 76, height: 20, kittyKeyboard: true });
    try {
      const pending = promptSelect(setup.renderer, {
        options: sectionOptions(),
        filterable: true,
      });
      await setup.renderOnce();

      await setup.mockInput.typeText("skill");
      await setup.renderOnce();
      expect(setup.captureCharFrame()).toMatch(/Filtro: skill/);

      setup.mockInput.pressEscape();
      await setup.renderOnce();
      const cleared = setup.captureCharFrame();
      expect(cleared).not.toMatch(/Filtro: skill/);
      expect(cleared).toMatch(/Herramientas de terminal/);

      setup.mockInput.pressEscape();
      expect(await pending).toBe(null);
    } finally {
      setup.renderer.destroy();
    }
  });

  it("arrow keys move the selection and `q` cancels a non-filterable list", async () => {
    const setup = await createTestRenderer({ width: 76, height: 18 });
    try {
      const options = eventOptions();
      const pending = promptSelect(setup.renderer, { options });
      await setup.renderOnce();

      setup.mockInput.pressArrow("down");
      await setup.renderOnce();

      setup.mockInput.pressEnter();
      const picked = await pending;
      expect(picked?.index).toBe(1);

      const second = promptSelect(setup.renderer, { options });
      await setup.renderOnce();
      await setup.mockInput.typeText("q");
      expect(await second).toBe(null);
    } finally {
      setup.renderer.destroy();
    }
  });

  it("promptConfirm resolves true only on the confirm row", async () => {
    const setup = await createTestRenderer({ width: 70, height: 16 });
    try {
      const yes = promptConfirm(setup.renderer, {
        title: "Instalar gh",
        detail: "brew install gh",
      });
      await setup.renderOnce();
      expect(setup.captureCharFrame()).toMatch(/brew install gh/);
      setup.mockInput.pressEnter();
      expect(await yes).toBe(true);

      const no = promptConfirm(setup.renderer, { title: "Instalar gh" });
      await setup.renderOnce();
      setup.mockInput.pressArrow("down");
      setup.mockInput.pressEnter();
      expect(await no).toBe(false);
    } finally {
      setup.renderer.destroy();
    }
  });

  it("removes its subtree once resolved so screens do not stack", async () => {
    const setup = await createTestRenderer({ width: 70, height: 16 });
    try {
      const before = setup.renderer.root.getChildren().length;
      const pending = promptSelect(setup.renderer, {
        options: [{ name: "uno", description: "" }],
      });
      await setup.renderOnce();
      expect(setup.renderer.root.getChildren().length).toBe(before + 1);

      setup.mockInput.pressEnter();
      await pending;
      await setup.renderOnce();
      expect(setup.renderer.root.getChildren().length).toBe(before);
    } finally {
      setup.renderer.destroy();
    }
  });
});

describe("ui/app — interactivity gate", () => {
  const tty = { isTTY: true, setRawMode() {} };

  it("requires a TTY on both ends and honours CI / --no-interactive", () => {
    expect(isInteractive({ stdin: tty, stdout: { isTTY: true }, env: {} })).toBe(true);
    expect(
      isInteractive({ stdin: tty, stdout: { isTTY: true }, env: {}, noInteractive: true }),
    ).toBe(false);
    expect(
      isInteractive({ stdin: tty, stdout: { isTTY: true }, env: { CI: "true" } }),
    ).toBe(false);
    expect(isInteractive({ stdin: tty, stdout: { isTTY: false }, env: {} })).toBe(false);
    expect(
      isInteractive({ stdin: { isTTY: true }, stdout: { isTTY: true }, env: {} }),
    ).toBe(false);
  });
});

describe("ui/views — home launcher", () => {
  it("lists only commands that work without arguments", () => {
    const names = homeOptions().map((o) => o.name);
    expect(names).toContain("tools");
    expect(names).toContain("dino");
    expect(names).toContain("salir");
    // These need an argument, so they stay CLI-only.
    expect(names).not.toContain("open");
    expect(names).not.toContain("completion");
  });

  it("keeps every description to a single short line", () => {
    for (const o of homeOptions()) {
      expect(o.description!.length).toBeLessThanOrEqual(48);
      expect(o.description).not.toContain("\n");
    }
  });

  it("renders as a picker and resolves the chosen command", async () => {
    const setup = await createTestRenderer({ width: 76, height: 24 });
    try {
      const pending = promptSelect(setup.renderer, {
        title: "Alquimia",
        options: homeOptions(),
        filterable: true,
      });
      await setup.renderOnce();
      expect(setup.captureCharFrame()).toMatch(/info/);

      await setup.mockInput.typeText("dino");
      await setup.renderOnce();
      setup.mockInput.pressEnter();

      expect((await pending)?.option.value).toBe("dino");
    } finally {
      setup.renderer.destroy();
    }
  });
});

describe("ui/views — picker option builders", () => {
  it("tool options carry filter text and install tags", () => {
    const section = toolSections.find((s) => s.id === "terminal")!;
    const options = toolOptions(section);
    expect(options.length).toBe(section.tools.length);
    expect(options[0].filterText).toContain(section.tools[0].id);
    expect(options.some((o) => o.name.includes("(install)"))).toBe(true);
  });

  it("event options describe when each call happens", () => {
    const options = eventOptions();
    expect(options.length).toBeGreaterThan(0);
    expect(options.some((o) => o.name.includes("(próxima)"))).toBe(true);
    expect(options[0].description).toMatch(/ARG \(UTC-3\)/);
  });
});
