import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/alquimia.js");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

function runCli(args, env = {}) {
  return spawnSync(process.execPath, [bin, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1", ...env },
  });
}

describe("CLI smoke", () => {
  it("version exits 0 and prints package version", () => {
    const r = runCli(["version"]);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe(pkg.version);
    expect(pkg.version).toBe("0.5.5");
  });

  it("tools --json exits 0, parses, has no gratis / by-the-way-tests", () => {
    const r = runCli(["tools", "--json"]);
    expect(r.status).toBe(0);
    const data = JSON.parse(r.stdout);
    expect(data).toHaveProperty("sections");
    expect(Array.isArray(data.sections)).toBe(true);

    const ids = data.sections.map((s) => s.id);
    const names = data.sections.map((s) => s.name);
    expect(ids).not.toContain("gratis");
    expect(names.some((n) => /gratis/i.test(n))).toBe(false);

    const toolIds = data.sections.flatMap((s) =>
      (s.tools || []).map((t) => t.id)
    );
    const toolNames = data.sections.flatMap((s) =>
      (s.tools || []).map((t) => t.name)
    );
    expect(toolIds).not.toContain("by-the-way-tests");
    expect(
      toolNames.some((n) => /by the way tests/i.test(String(n)))
    ).toBe(false);
  });

  it("tools --list exits 0 and lists known sections", () => {
    const r = runCli(["tools", "--list"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/terminal|agents|skills/i);
    // No gratis *section* (id line) — "gratis/premium" in a tool blurb is fine.
    expect(r.stdout).not.toMatch(/^id:\s*gratis\s*$/m);
    expect(r.stdout).not.toMatch(/by the way tests/i);
  });

  it("tools --json catalog matches src/tools.js exports", async () => {
    const { toolSections, toolsCatalogPayload } = await import(
      "../src/tools.js"
    );
    const r = runCli(["tools", "--json"]);
    const data = JSON.parse(r.stdout);
    expect(data).toEqual(toolsCatalogPayload());
    expect(toolSections.some((s) => s.id === "gratis")).toBe(false);
  });
});
