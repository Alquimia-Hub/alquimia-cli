import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  collectDoctorReport,
  describeTerminal,
  findDuplicateInstallHints,
  formatDoctorReport,
  inspectGhosttyManagedBlock,
} from "../src/doctor.js";
import { GHOSTTY_BLOCK_BEGIN, GHOSTTY_BLOCK_END } from "../src/art.js";

describe("describeTerminal", () => {
  it("marks Ghostty as art-supported", () => {
    const t = describeTerminal("ghostty", { TERM_PROGRAM: "ghostty" });
    expect(t.artSupported).toBe(true);
    expect(t.label).toMatch(/Ghostty/i);
    expect(t.termProgram).toBe("ghostty");
  });

  it("marks vscode as unsupported for art", () => {
    expect(describeTerminal("vscode").artSupported).toBe(false);
  });
});

describe("findDuplicateInstallHints", () => {
  it("lists existing common paths (soft)", () => {
    const root = mkdtempSync(join(tmpdir(), "alquimia-doc-"));
    try {
      const brew = join(root, "opt", "homebrew", "bin", "alquimia");
      const nvm = join(root, ".nvm", "current", "bin", "alquimia");
      mkdirSync(dirname(brew), { recursive: true });
      mkdirSync(dirname(nvm), { recursive: true });
      writeFileSync(brew, "#!/bin/sh\n");
      writeFileSync(nvm, "#!/bin/sh\n");

      // Override candidates by checking exists against our fake tree via custom exists
      // and injecting paths through argv1 + a custom exists that maps homebrew/nvm.
      const exists = (p) => {
        if (p === "/opt/homebrew/bin/alquimia") return true;
        if (p === join(root, ".nvm", "current", "bin", "alquimia")) return true;
        if (p === brew || p === nvm) return true;
        return false;
      };

      const found = findDuplicateInstallHints({
        home: root,
        env: { NVM_DIR: join(root, ".nvm") },
        existsSync: exists,
        argv1: brew,
      });
      expect(found.length).toBeGreaterThanOrEqual(2);
      expect(found.some((p) => p.includes("homebrew"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("inspectGhosttyManagedBlock", () => {
  it("detects managed block", () => {
    const root = mkdtempSync(join(tmpdir(), "alquimia-gh-"));
    try {
      const configPath = join(root, ".config", "ghostty", "config");
      mkdirSync(dirname(configPath), { recursive: true });
      writeFileSync(
        configPath,
        `${GHOSTTY_BLOCK_BEGIN}\nbackground-image = /x\n${GHOSTTY_BLOCK_END}\n`,
        "utf8"
      );
      const info = inspectGhosttyManagedBlock({
        home: root,
        env: {},
        platform: "linux",
      });
      expect(info.exists).toBe(true);
      expect(info.managedBlock).toBe(true);
      expect(info.configPath).toBe(configPath);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("collectDoctorReport / formatDoctorReport", () => {
  it("builds a report with expected keys", () => {
    const home = mkdtempSync(join(tmpdir(), "alquimia-doc2-"));
    try {
      const report = collectDoctorReport({
        env: { TERM_PROGRAM: "ghostty", ALQUIMIA_NO_UPDATE: "1" },
        argv: ["doctor", "--no-update"],
        argv1: "/tmp/fake-alquimia",
        home,
        stdoutIsTTY: true,
        nodeVersion: "v22.0.0",
        version: "0.5.15",
        existsSync: () => false,
      });
      expect(report.alquimia.version).toBe("0.5.15");
      expect(report.node.version).toBe("v22.0.0");
      expect(report.terminal.id).toBe("ghostty");
      expect(report.terminal.artSupported).toBe(true);
      expect(report.autoUpdate.disabled).toBe(true);
      expect(report.autoUpdate.reasons.envNoUpdate).toBe(true);
      expect(report.artPrefs.opacity).toBe(0.28);
      expect(report.ok).toBe(true);

      const text = formatDoctorReport(report).join("\n");
      expect(text).toMatch(/Alquimia doctor/);
      expect(text).toMatch(/0\.5\.15/);
      expect(text).toMatch(/Ghostty/);
      expect(text).toMatch(/Auto-update/);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
