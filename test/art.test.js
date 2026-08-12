import { describe, it, expect } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  detectTerminal,
  ensurePersistedArt,
  ghosttyConfigCandidates,
  resolveGhosttyConfigPath,
  clearGhosttyArtFromConfig,
  patchGhosttyConfigContent,
  setGhosttyBackground,
  clearGhosttyBackground,
  ghosttyReloadHint,
  patchWeztermConfigContent,
  clearWeztermArtFromConfig,
  setWeztermBackground,
  clearWeztermBackground,
  patchContourConfigContent,
  clearContourArtFromConfig,
  setContourBackground,
  patchHyperConfigContent,
  clearHyperArtFromConfig,
  patchTabbyConfigContent,
  clearTabbyArtFromConfig,
  patchWindowsTerminalSettings,
  clearWindowsTerminalSettings,
  toWindowsPathIfWsl,
  patchConfigBlock,
  clearConfigBlock,
  BLOCK_BEGIN,
  BLOCK_END,
  GHOSTTY_BLOCK_BEGIN,
  GHOSTTY_BLOCK_END,
  LEGACY_GHOSTTY_MARKER,
  GHOSTTY_DEFAULT_OPACITY,
  getArtPath,
} from "../src/art.js";
import { LUA_BLOCK_BEGIN, CSS_BLOCK_BEGIN } from "../src/art/config-block.js";

describe("detectTerminal", () => {
  it("detects iTerm2, Kitty, Ghostty, WezTerm", () => {
    expect(detectTerminal({ ITERM_SESSION_ID: "w0t0:1" })).toBe("iterm2");
    expect(detectTerminal({ TERM_PROGRAM: "iTerm.app" })).toBe("iterm2");
    expect(detectTerminal({ KITTY_WINDOW_ID: "1" })).toBe("kitty");
    expect(detectTerminal({ TERM: "xterm-kitty" })).toBe("kitty");
    expect(detectTerminal({ TERM_PROGRAM: "ghostty" })).toBe("ghostty");
    expect(
      detectTerminal({ GHOSTTY_RESOURCES_DIR: "/Applications/Ghostty.app" })
    ).toBe("ghostty");
    expect(detectTerminal({ TERM: "xterm-ghostty" })).toBe("ghostty");
    expect(detectTerminal({ WEZTERM_PANE: "1" })).toBe("wezterm");
    expect(detectTerminal({ TERM_PROGRAM: "WezTerm" })).toBe("wezterm");
  });

  it("detects Contour, Tilix, Hyper, Tabby, Windows Terminal, Terminology", () => {
    expect(detectTerminal({ TERMINAL_NAME: "contour" })).toBe("contour");
    expect(detectTerminal({ CONTOUR_PROFILE: "main" })).toBe("contour");
    expect(detectTerminal({ TERM: "contour" })).toBe("contour");
    expect(detectTerminal({ TILIX_ID: "abc" })).toBe("tilix");
    expect(detectTerminal({ TERM_PROGRAM: "Hyper" })).toBe("hyper");
    expect(
      detectTerminal({ TABBY_CONFIG_DIRECTORY: "/home/u/.config/tabby" })
    ).toBe("tabby");
    expect(detectTerminal({ WT_SESSION: "guid" })).toBe("windows-terminal");
    expect(detectTerminal({ TERM: "xterm-terminology" })).toBe("terminology");
    expect(detectTerminal({ TERMINOLOGY: "1" })).toBe("terminology");
  });

  it("detects known-unsupported terminals by name", () => {
    expect(detectTerminal({ ALACRITTY_SOCKET: "/tmp/a" })).toBe("alacritty");
    expect(detectTerminal({ KONSOLE_VERSION: "22" })).toBe("konsole");
    expect(detectTerminal({ TERM_PROGRAM: "Apple_Terminal" })).toBe(
      "apple-terminal"
    );
    expect(detectTerminal({ TERM_PROGRAM: "vscode" })).toBe("vscode");
    expect(detectTerminal({ GNOME_TERMINAL_SCREEN: "1" })).toBe(
      "gnome-terminal"
    );
  });

  it("prefers iTerm2 / Kitty over Ghostty when both leak", () => {
    expect(
      detectTerminal({
        ITERM_SESSION_ID: "x",
        GHOSTTY_RESOURCES_DIR: "/ghostty",
      })
    ).toBe("iterm2");
    expect(
      detectTerminal({
        KITTY_WINDOW_ID: "1",
        TERM_PROGRAM: "ghostty",
      })
    ).toBe("kitty");
  });

  it("returns unsupported for empty / tmux-only env", () => {
    expect(detectTerminal({})).toBe("unsupported");
    expect(detectTerminal({ TMUX: "1" })).toBe("unsupported");
  });
});

describe("config-block helpers", () => {
  it("patches and clears BEGIN/END blocks idempotently", () => {
    const once = patchConfigBlock("a = 1\n", BLOCK_BEGIN, BLOCK_END, [
      "b = 2",
    ]);
    expect(once).toContain(BLOCK_BEGIN);
    expect(once).toContain("b = 2");
    expect(once).toContain(BLOCK_END);
    const twice = patchConfigBlock(once, BLOCK_BEGIN, BLOCK_END, ["b = 3"]);
    expect(twice.match(/b = /g)).toHaveLength(1);
    expect(twice).toContain("b = 3");
    expect(clearConfigBlock(twice, BLOCK_BEGIN, BLOCK_END)).toContain("a = 1");
    expect(clearConfigBlock(twice, BLOCK_BEGIN, BLOCK_END)).not.toContain(
      BLOCK_BEGIN
    );
  });
});

describe("ensurePersistedArt", () => {
  it("copies bundled art into ~/.local/share/alquimia", () => {
    const root = mkdtempSync(join(tmpdir(), "alquimia-art-"));
    try {
      const bundled = join(root, "bundled.png");
      writeFileSync(bundled, "png-bytes", "utf8");
      const dest = ensurePersistedArt(bundled, { home: root });
      expect(dest).toBe(join(root, ".local", "share", "alquimia", "art.png"));
      expect(existsSync(dest)).toBe(true);
      expect(readFileSync(dest, "utf8")).toBe("png-bytes");
      // second call is idempotent
      expect(ensurePersistedArt(bundled, { home: root })).toBe(dest);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("Ghostty config patcher", () => {
  const art = "/abs/path/to/art.png";

  it("lists GHOSTTY_CONFIG_PATH, macOS App Support, then XDG", () => {
    const paths = ghosttyConfigCandidates({
      home: "/Users/nico",
      platform: "darwin",
      xdgConfigHome: null,
      env: { GHOSTTY_CONFIG_PATH: "/custom/ghostty.conf" },
    });
    expect(paths[0]).toBe("/custom/ghostty.conf");
    expect(paths).toContain(
      "/Users/nico/Library/Application Support/com.mitchellh.ghostty/config"
    );
    expect(paths).toContain("/Users/nico/.config/ghostty/config");
    // App Support before XDG on macOS
    expect(
      paths.indexOf(
        "/Users/nico/Library/Application Support/com.mitchellh.ghostty/config"
      )
    ).toBeLessThan(paths.indexOf("/Users/nico/.config/ghostty/config"));
  });

  it("patches with # BEGIN/END alquimia-art and Ghostty 1.2 keys", () => {
    expect(GHOSTTY_DEFAULT_OPACITY).toBe(0.35);
    const next = patchGhosttyConfigContent("theme = dark\n", art);
    expect(next).toContain(GHOSTTY_BLOCK_BEGIN);
    expect(next).toContain(GHOSTTY_BLOCK_END);
    expect(next).toContain(`background-image = ${art}`);
    expect(next).toContain("background-image-opacity = 0.35");
    expect(next).toContain("background-image-position = center");
    expect(next).toContain("background-image-fit = contain");
    expect(next).toContain("background-image-repeat = false");
    expect(next).toContain("theme = dark");
  });

  it("clears BEGIN/END block, >>> legacy block, and # alquimia-art pairs", () => {
    const modern = patchGhosttyConfigContent("x = 1\n", art);
    expect(clearGhosttyArtFromConfig(modern)).not.toContain("background-image");

    const arrowLegacy = patchConfigBlock("y = 2\n", BLOCK_BEGIN, BLOCK_END, [
      `background-image = ${art}`,
    ]);
    expect(clearGhosttyArtFromConfig(arrowLegacy)).not.toContain(
      "background-image"
    );

    const legacy = [
      "font-size = 14",
      LEGACY_GHOSTTY_MARKER,
      `background-image = ${art}`,
      LEGACY_GHOSTTY_MARKER,
      "background-image-opacity = 0.25",
      "",
    ].join("\n");
    const cleared = clearGhosttyArtFromConfig(legacy);
    expect(cleared).toContain("font-size = 14");
    expect(cleared).not.toContain("background-image");
    expect(cleared).not.toContain(LEGACY_GHOSTTY_MARKER);
  });

  it("set creates parent dirs; clear removes only managed block", () => {
    const root = mkdtempSync(join(tmpdir(), "alquimia-art-"));
    try {
      const xdg = join(root, "xdg");
      const opts = {
        home: root,
        platform: "linux",
        xdgConfigHome: xdg,
        env: {},
      };
      const set = setGhosttyBackground(art, opts);
      expect(set.ok).toBe(true);
      expect(existsSync(set.configPath)).toBe(true);
      expect(set.needsReload).toBe(true);
      const text = readFileSync(set.configPath, "utf8");
      expect(text).toContain("# BEGIN alquimia-art");
      expect(text).toContain("# END alquimia-art");
      const cleared = clearGhosttyBackground(opts);
      expect(cleared.ok).toBe(true);
      expect(cleared.changed).toBe(true);
      expect(readFileSync(set.configPath, "utf8")).not.toContain(
        "background-image"
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("resolve honors GHOSTTY_CONFIG_PATH; else first existing (macOS App Support)", () => {
    const root = mkdtempSync(join(tmpdir(), "alquimia-art-"));
    try {
      const xdg = join(root, "xdg");
      const mac = join(
        root,
        "Library",
        "Application Support",
        "com.mitchellh.ghostty"
      );
      mkdirSync(join(xdg, "ghostty"), { recursive: true });
      mkdirSync(mac, { recursive: true });
      writeFileSync(join(xdg, "ghostty", "config"), "a = 1\n", "utf8");
      writeFileSync(join(mac, "config"), "b = 2\n", "utf8");
      expect(
        resolveGhosttyConfigPath({
          home: root,
          platform: "darwin",
          xdgConfigHome: xdg,
          env: {},
        })
      ).toBe(join(mac, "config"));

      const custom = join(root, "custom.conf");
      writeFileSync(custom, "c = 3\n", "utf8");
      expect(
        resolveGhosttyConfigPath({
          home: root,
          platform: "darwin",
          xdgConfigHome: xdg,
          env: { GHOSTTY_CONFIG_PATH: custom },
        })
      ).toBe(custom);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reload hint says config+reload, not live OSC", () => {
    expect(ghosttyReloadHint("darwin")).toMatch(/no aplica el fondo en vivo/i);
    expect(ghosttyReloadHint("darwin")).toMatch(/⌘⇧,|cmd\+shift\+,/i);
    expect(ghosttyReloadHint("linux")).toMatch(/Ctrl\+Shift\+,/);
  });
});

describe("WezTerm config patcher", () => {
  const art = "/abs/art.png";

  it("creates minimal config_builder file when empty", () => {
    const next = patchWeztermConfigContent("", art);
    expect(next).toContain("wezterm.config_builder()");
    expect(next).toContain("window_background_image");
    expect(next).toContain(LUA_BLOCK_BEGIN);
    expect(next).toContain("return config");
  });

  it("appends marked block to existing lua and clears it", () => {
    const prev = [
      "local wezterm = require 'wezterm'",
      "local config = wezterm.config_builder()",
      "config.font_size = 14",
      "return config",
      "",
    ].join("\n");
    const once = patchWeztermConfigContent(prev, art);
    expect(once).toContain("config.font_size = 14");
    expect(once).toContain(`config.window_background_image = '${art}'`);
    const twice = patchWeztermConfigContent(once, "/other.png");
    expect(twice.match(/window_background_image\s*=/g)).toHaveLength(1);
    expect(twice).toContain("/other.png");
    const cleared = clearWeztermArtFromConfig(twice);
    expect(cleared).not.toContain(LUA_BLOCK_BEGIN);
    expect(cleared).toContain("config.font_size = 14");
  });

  it("set/clear with temp HOME", () => {
    const root = mkdtempSync(join(tmpdir(), "alquimia-art-"));
    try {
      const opts = { home: root, xdgConfigHome: join(root, "xdg") };
      const set = setWeztermBackground(art, opts);
      expect(set.ok).toBe(true);
      expect(existsSync(set.configPath)).toBe(true);
      const cleared = clearWeztermBackground(opts);
      expect(cleared.changed).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("Contour config patcher", () => {
  const art = "/home/u/art.png";

  it("inserts background_image under color_schemes.default", () => {
    const prev = ["color_schemes:", "  default:", "    background: '#111'", ""].join(
      "\n"
    );
    const next = patchContourConfigContent(prev, art, { opacity: 0.3 });
    expect(next).toContain(BLOCK_BEGIN);
    expect(next).toContain("background_image:");
    expect(next).toContain(`path: '${art}'`);
    expect(next).toContain("opacity: 0.3");
    expect(next).toContain("background: '#111'");
    expect(clearContourArtFromConfig(next)).not.toContain("background_image");
  });

  it("creates minimal yaml when empty + set on disk", () => {
    const root = mkdtempSync(join(tmpdir(), "alquimia-art-"));
    try {
      const opts = { home: root, xdgConfigHome: join(root, "xdg") };
      const set = setContourBackground(art, opts);
      expect(set.ok).toBe(true);
      expect(readFileSync(set.configPath, "utf8")).toContain("color_schemes:");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("Hyper config patcher", () => {
  const art = "/Users/nico/art.png";

  it("injects CSS into existing css template and clears markers", () => {
    const prev = [
      "module.exports = {",
      "  config: {",
      "    css: `",
      "      .tabs_nav { color: red; }",
      "    `,",
      "  },",
      "};",
      "",
    ].join("\n");
    const next = patchHyperConfigContent(prev, art);
    expect(next).toContain(CSS_BLOCK_BEGIN);
    expect(next).toContain("file:///Users/nico/art.png");
    expect(next).toContain(".tabs_nav { color: red; }");
    const cleared = clearHyperArtFromConfig(next);
    expect(cleared).not.toContain(CSS_BLOCK_BEGIN);
    expect(cleared).toContain(".tabs_nav");
  });

  it("creates minimal .hyper.js when empty", () => {
    const next = patchHyperConfigContent("", art);
    expect(next).toContain("module.exports");
    expect(next).toContain(".terms_terms");
  });
});

describe("Tabby config patcher", () => {
  const art = "/home/u/art.png";

  it("injects marked CSS into appearance.css", () => {
    const prev = ["appearance:", "  css: '/* hi */'", "  opacity: 1", ""].join(
      "\n"
    );
    const next = patchTabbyConfigContent(prev, art);
    expect(next).toContain(CSS_BLOCK_BEGIN);
    expect(next).toContain("file:///home/u/art.png");
    expect(next).toContain("opacity: 1");
    const cleared = clearTabbyArtFromConfig(next);
    expect(cleared).not.toContain(CSS_BLOCK_BEGIN);
  });
});

describe("Windows Terminal settings patcher", () => {
  it("patches profiles.defaults backgroundImage keys", () => {
    const prev = JSON.stringify(
      {
        profiles: {
          defaults: { cursorShape: "bar" },
          list: [{ name: "Ubuntu" }],
        },
      },
      null,
      4
    );
    const next = patchWindowsTerminalSettings(prev, "C:/img/art.png", {
      opacity: 0.2,
    });
    expect(next).toContain('"backgroundImage"');
    expect(next).toContain("C:/img/art.png");
    expect(next).toContain('"backgroundImageOpacity": 0.2');
    expect(next).toContain("cursorShape");
    const cleared = clearWindowsTerminalSettings(next);
    expect(cleared).not.toContain("backgroundImage");
    expect(cleared).toContain("cursorShape");
  });

  it("toWindowsPathIfWsl converts /mnt/c paths", () => {
    expect(toWindowsPathIfWsl("/mnt/c/Users/nico/a.png")).toBe(
      "C:\\Users\\nico\\a.png"
    );
    expect(toWindowsPathIfWsl("/home/u/a.png")).toBe("/home/u/a.png");
  });
});

describe("getArtPath", () => {
  it("points at bundled assets/art.png", () => {
    const p = getArtPath();
    expect(p.endsWith(join("assets", "art.png"))).toBe(true);
    expect(existsSync(p)).toBe(true);
  });
});
