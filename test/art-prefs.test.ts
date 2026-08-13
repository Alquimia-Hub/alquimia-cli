import { describe, it, expect } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  DEFAULT_ART_FIT,
  DEFAULT_ART_OPACITY,
  artPrefsPath,
  cssBackgroundSize,
  loadArtPrefs,
  parseArtCliArgs,
  parseFit,
  parseOpacity,
  patchGhosttyConfigContent,
  saveArtPrefs,
  weztermFitTokens,
  windowsTerminalStretchMode,
} from "../src/art.ts";

describe("parseOpacity / parseFit", () => {
  it("accepts 0..1 opacity", () => {
    expect(parseOpacity("0")).toBe(0);
    expect(parseOpacity("1")).toBe(1);
    expect(parseOpacity("0.28")).toBe(0.28);
    expect(parseOpacity(0.5)).toBe(0.5);
  });

  it("rejects out of range / garbage", () => {
    expect(parseOpacity("-0.1")).toBeNull();
    expect(parseOpacity("1.1")).toBeNull();
    expect(parseOpacity("nope")).toBeNull();
    expect(parseOpacity("")).toBeNull();
    expect(parseOpacity(null)).toBeNull();
  });

  it("parses fit values", () => {
    expect(parseFit("cover")).toBe("cover");
    expect(parseFit("CONTAIN")).toBe("contain");
    expect(parseFit("stretch")).toBe("stretch");
    expect(parseFit("zoom")).toBeNull();
  });
});

describe("parseArtCliArgs", () => {
  it("parses --opacity space and equals forms", () => {
    expect(parseArtCliArgs(["art", "--opacity", "0.4"]).opacity).toBe(0.4);
    expect(parseArtCliArgs(["--opacity=0.28"]).opacity).toBe(0.28);
    expect(parseArtCliArgs(["--opacity=0.28"]).opacityProvided).toBe(true);
  });

  it("parses --fit space and equals forms", () => {
    expect(parseArtCliArgs(["--fit", "contain"]).fit).toBe("contain");
    expect(parseArtCliArgs(["--fit=stretch"]).fit).toBe("stretch");
    expect(parseArtCliArgs(["--fit=stretch"]).fitProvided).toBe(true);
  });

  it("parses clear/open/path", () => {
    const a = parseArtCliArgs(["art", "--clear", "--open", "--path"]);
    expect(a.clear).toBe(true);
    expect(a.open).toBe(true);
    expect(a.pathOnly).toBe(true);
    expect(parseArtCliArgs(["clear"]).clear).toBe(true);
  });

  it("collects errors for bad opacity/fit", () => {
    const bad = parseArtCliArgs(["--opacity", "2", "--fit", "zoom"]);
    expect(bad.errors.length).toBe(2);
    expect(bad.opacity).toBeNull();
    expect(bad.fit).toBeNull();
  });

  it("defaults provided flags to false when absent", () => {
    const a = parseArtCliArgs(["art"]);
    expect(a.opacityProvided).toBe(false);
    expect(a.fitProvided).toBe(false);
    expect(a.opacity).toBeNull();
    expect(a.fit).toBeNull();
  });
});

describe("loadArtPrefs / saveArtPrefs", () => {
  it("returns defaults when file missing", () => {
    const root = mkdtempSync(join(tmpdir(), "alquimia-prefs-"));
    try {
      const prefs = loadArtPrefs({ home: root });
      expect(prefs.opacity).toBe(DEFAULT_ART_OPACITY);
      expect(prefs.fit).toBe(DEFAULT_ART_FIT);
      expect(prefs.fromDisk).toBe(false);
      expect(prefs.path).toBe(artPrefsPath({ home: root }));
      expect(existsSync(prefs.path)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("round-trips save → load", () => {
    const root = mkdtempSync(join(tmpdir(), "alquimia-prefs-"));
    try {
      const saved = saveArtPrefs(
        { opacity: 0.4, fit: "contain" },
        { home: root }
      );
      expect(saved.opacity).toBe(0.4);
      expect(saved.fit).toBe("contain");
      expect(existsSync(saved.path)).toBe(true);
      const raw = JSON.parse(readFileSync(saved.path, "utf8"));
      expect(raw).toEqual({ opacity: 0.4, fit: "contain" });
      const loaded = loadArtPrefs({ home: root });
      expect(loaded.fromDisk).toBe(true);
      expect(loaded.opacity).toBe(0.4);
      expect(loaded.fit).toBe("contain");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("tolerates corrupt JSON with defaults", () => {
    const root = mkdtempSync(join(tmpdir(), "alquimia-prefs-"));
    try {
      const path = artPrefsPath({ home: root });
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, "{not-json", "utf8");
      const prefs = loadArtPrefs({ home: root });
      expect(prefs.fromDisk).toBe(false);
      expect(prefs.opacity).toBe(DEFAULT_ART_OPACITY);
      expect(prefs.fit).toBe(DEFAULT_ART_FIT);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("fit mapping helpers", () => {
  it("maps WezTerm / WT / CSS fits", () => {
    expect(weztermFitTokens("cover")).toEqual({
      width: "Cover",
      height: "Cover",
    });
    expect(weztermFitTokens("contain")).toEqual({
      width: "Contain",
      height: "Contain",
    });
    expect(weztermFitTokens("stretch")).toEqual({
      width: "100%",
      height: "100%",
    });
    expect(windowsTerminalStretchMode("cover")).toBe("uniformToFill");
    expect(windowsTerminalStretchMode("contain")).toBe("uniform");
    expect(windowsTerminalStretchMode("stretch")).toBe("fill");
    expect(cssBackgroundSize("cover")).toBe("cover");
    expect(cssBackgroundSize("contain")).toBe("contain");
    expect(cssBackgroundSize("stretch")).toBe("100% 100%");
  });
});

describe("Ghostty prefs rewrite", () => {
  it("patchGhosttyConfigContent honors opacity + fit", () => {
    const next = patchGhosttyConfigContent("theme = dark\n", "/tmp/art.png", {
      opacity: 0.4,
      fit: "stretch",
    });
    expect(next).toContain("background-image-opacity = 0.4");
    expect(next).toContain("background-image-fit = stretch");
    expect(next).toContain("# BEGIN alquimia-art");
  });
});
