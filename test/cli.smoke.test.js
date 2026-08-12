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

describe("CLI smoke — version", () => {
  it("version exits 0 and prints package version", () => {
    const r = runCli(["version"]);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe(pkg.version);
    expect(pkg.version).toBe("0.5.15");
  });

  it("-v / --version match version command", () => {
    const a = runCli(["-v"]);
    const b = runCli(["--version"]);
    const c = runCli(["version"]);
    expect(a.status).toBe(0);
    expect(b.status).toBe(0);
    expect(a.stdout.trim()).toBe(pkg.version);
    expect(b.stdout.trim()).toBe(pkg.version);
    expect(c.stdout.trim()).toBe(pkg.version);
  });
});

describe("CLI smoke — help", () => {
  it("help / -h have Uso + Comandos and must NOT dump verbose sections", () => {
    for (const args of [["help"], ["-h"], ["--help"], []]) {
      const r = runCli(args);
      expect(r.status, String(args)).toBe(0);
      expect(r.stdout, String(args)).toMatch(/Uso/);
      expect(r.stdout, String(args)).toMatch(/Comandos/);
      expect(r.stdout, String(args)).not.toMatch(/Ejemplos/);
      expect(r.stdout, String(args)).not.toMatch(/^Opciones\b/m);
      expect(r.stdout, String(args)).not.toMatch(/Redes para open/);
      expect(r.stdout, String(args)).not.toMatch(/Secciones de tools/);
      expect(r.stdout, String(args)).not.toMatch(/^Auto-update\b/m);
    }
  });
});

describe("CLI smoke — tools catalog", () => {
  it("tools --json structure: section ids, no gratis, no by the way", () => {
    const r = runCli(["tools", "--json"]);
    expect(r.status).toBe(0);
    const data = JSON.parse(r.stdout);
    expect(data).toHaveProperty("sections");
    expect(Array.isArray(data.sections)).toBe(true);
    expect(data.sections.length).toBeGreaterThan(0);

    const ids = data.sections.map((s) => s.id);
    const names = data.sections.map((s) => s.name);
    for (const id of ids) {
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    }
    expect(ids).toEqual(expect.arrayContaining(["terminal", "agents", "skills"]));
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

    // Each section has tools array
    for (const section of data.sections) {
      expect(section).toHaveProperty("id");
      expect(section).toHaveProperty("name");
      expect(Array.isArray(section.tools)).toBe(true);
    }
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

  it("tools <unknown-section> negative path (exit/message)", () => {
    const r = runCli(["tools", "no-existe-xyz", "--list"]);
    expect(r.status).not.toBe(0);
    const err = `${r.stderr}${r.stdout}`;
    expect(err).toMatch(/No conozco la sección/i);
    expect(err).toMatch(/no-existe-xyz/);
  });
});

describe("CLI smoke — events --json", () => {
  it("monday/wednesday urls present and swapped correctly on master", () => {
    const r = runCli(["events", "--json"]);
    expect(r.status).toBe(0);
    const data = JSON.parse(r.stdout);

    expect(data).toHaveProperty("events");
    expect(Array.isArray(data.events)).toBe(true);

    const monday = data.events.find(
      (e) => e.id === "community-call-monday" || e.weekday === "lunes"
    );
    const wednesday = data.events.find(
      (e) =>
        e.id === "community-call-wednesday" || e.weekday === "miércoles"
    );
    expect(monday).toBeTruthy();
    expect(wednesday).toBeTruthy();

    const mondayUrl = monday.discordEventUrl || monday.url || "";
    const wednesdayUrl = wednesday.discordEventUrl || wednesday.url || "";

    // Swapped fix (0.5.7): lunes → 1535005054405185598; miércoles → 1506675889658921081
    expect(mondayUrl).toContain("1535005054405185598");
    expect(wednesdayUrl).toContain("1506675889658921081");
    // Must not be the pre-fix crossed pairing
    expect(mondayUrl).not.toContain("1506675889658921081");
    expect(wednesdayUrl).not.toContain("1535005054405185598");

    expect(data.timezone).toBe("America/Argentina/Buenos_Aires");
    expect(data.place).toBe("Discord");
    expect(data).toHaveProperty("next");
    expect(data).toHaveProperty("discord");
  });
});

describe("CLI smoke — info / join --json", () => {
  it("info --json shape / required keys", () => {
    const r = runCli(["info", "--json"]);
    expect(r.status).toBe(0);
    const data = JSON.parse(r.stdout);
    expect(data).toHaveProperty("name");
    expect(data).toHaveProperty("tagline");
    expect(data).toHaveProperty("description");
    expect(data).toHaveProperty("links");
    expect(data).toHaveProperty("discord");
    expect(data).toHaveProperty("events");
    expect(typeof data.name).toBe("string");
    expect(data.links).toMatchObject({
      web: expect.any(String),
      github: expect.any(String),
      twitter: expect.any(String),
      discord: expect.any(String),
      whatsapp: expect.any(String),
    });
    expect(Array.isArray(data.events)).toBe(true);
    expect(data.events.length).toBeGreaterThanOrEqual(2);
  });

  it("join --json shape if command exists", () => {
    const r = runCli(["join", "--json"]);
    expect(r.status).toBe(0);
    const data = JSON.parse(r.stdout);
    expect(data).toHaveProperty("default", "discord");
    expect(data).toHaveProperty("options");
    expect(Array.isArray(data.options)).toBe(true);
    expect(data.options.length).toBeGreaterThan(0);
    expect(data.options[0]).toMatchObject({
      key: expect.any(String),
      label: expect.any(String),
      blurb: expect.any(String),
      url: expect.any(String),
    });
    expect(data).toHaveProperty("links");
    expect(data.links).toHaveProperty("discord");
  });
});

describe("CLI smoke — invalid command (negative)", () => {
  it("unknown command exits non-zero with message", () => {
    const r = runCli(["definitely-not-a-command"]);
    expect(r.status).not.toBe(0);
    const err = `${r.stderr}${r.stdout}`;
    expect(err).toMatch(/Comando desconocido/i);
    expect(err).toMatch(/definitely-not-a-command/);
  });
});

describe("CLI smoke — doctor", () => {
  it("doctor exits 0 and mentions Node / alquimia", () => {
    const r = runCli(["doctor", "--no-update"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Alquimia doctor/);
    expect(r.stdout).toMatch(/Node/);
    expect(r.stdout).toMatch(/0\.5\.15/);
  });

  it("doctor --json has expected keys", () => {
    const r = runCli(["doctor", "--json", "--no-update"]);
    expect(r.status).toBe(0);
    const data = JSON.parse(r.stdout);
    expect(data).toHaveProperty("node");
    expect(data).toHaveProperty("alquimia");
    expect(data).toHaveProperty("terminal");
    expect(data).toHaveProperty("artPrefs");
    expect(data).toHaveProperty("ghostty");
    expect(data).toHaveProperty("autoUpdate");
    expect(data.alquimia.version).toBe(pkg.version);
  });
});

describe("CLI smoke — completion", () => {
  it("completion zsh|bash|fish print scripts", () => {
    for (const shell of ["zsh", "bash", "fish"]) {
      const r = runCli(["completion", shell, "--no-update"]);
      expect(r.status, shell).toBe(0);
      expect(r.stdout.length, shell).toBeGreaterThan(50);
      expect(r.stdout, shell).toMatch(/alquimia/i);
    }
  });

  it("completion without shell is negative", () => {
    const r = runCli(["completion", "--no-update"]);
    expect(r.status).not.toBe(0);
    expect(`${r.stderr}${r.stdout}`).toMatch(/zsh\|bash\|fish|Falta el shell/i);
  });
});

describe("CLI smoke — help mentions new commands", () => {
  it("help lists doctor and completion", () => {
    const r = runCli(["help", "--no-update"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/\bdoctor\b/);
    expect(r.stdout).toMatch(/\bcompletion\b/);
  });
});
