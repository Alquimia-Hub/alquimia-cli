import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import {
  CHECK_INTERVAL_MS,
  UPDATE_COOLDOWN_MS,
  compareSemver,
  isNewer,
  shouldCheck,
  isUpdateInFlight,
  isAutoUpdateDisabled,
  readCache,
  writeCache,
  fetchRemoteVersion,
  maybeAutoUpdate,
  spawnBackgroundUpdate,
  resolveNpmGlobalRoot,
  globalAlquimiaCleanupTargets,
  cleanGlobalAlquimiaInstall,
  prepareGlobalInstall,
} from "../src/update.js";

function fakeSpawnSyncRoot(root) {
  return () => ({ status: 0, stdout: `${root}\n`, stderr: "" });
}

describe("compareSemver / isNewer", () => {
  it("compares major.minor.patch numerically", () => {
    expect(compareSemver("0.5.5", "0.5.7")).toBe(-1);
    expect(compareSemver("0.5.7", "0.5.5")).toBe(1);
    expect(compareSemver("0.5.5", "0.5.5")).toBe(0);
    expect(compareSemver("1.0.0", "0.9.9")).toBe(1);
    expect(compareSemver("0.5.10", "0.5.9")).toBe(1);
  });

  it("strips leading v and ignores pre-release / build for core compare", () => {
    expect(compareSemver("v0.5.7", "0.5.6")).toBe(1);
    expect(compareSemver("0.5.7-beta", "0.5.6")).toBe(1);
    expect(compareSemver("0.5.7+build", "0.5.7")).toBe(0);
  });

  it("isNewer is true only when remote > local", () => {
    expect(isNewer("0.5.7", "0.5.5")).toBe(true);
    expect(isNewer("0.5.5", "0.5.5")).toBe(false);
    expect(isNewer("0.5.4", "0.5.5")).toBe(false);
  });
});

describe("shouldCheck / isUpdateInFlight", () => {
  const now = 1_700_000_000_000;

  it("should check when cache is missing or invalid", () => {
    expect(shouldCheck(null, now)).toBe(true);
    expect(shouldCheck({}, now)).toBe(true);
    expect(shouldCheck({ checkedAt: "nope" }, now)).toBe(true);
  });

  it("skips network when last check is within the interval", () => {
    expect(
      shouldCheck({ checkedAt: now - CHECK_INTERVAL_MS + 1 }, now)
    ).toBe(false);
    expect(
      shouldCheck({ checkedAt: now - CHECK_INTERVAL_MS }, now)
    ).toBe(true);
    expect(
      shouldCheck({ checkedAt: now - CHECK_INTERVAL_MS - 1 }, now)
    ).toBe(true);
  });

  it("detects in-flight updates within cooldown", () => {
    expect(isUpdateInFlight(null, now)).toBe(false);
    expect(
      isUpdateInFlight({ updateStartedAt: now - UPDATE_COOLDOWN_MS + 1 }, now)
    ).toBe(true);
    expect(
      isUpdateInFlight({ updateStartedAt: now - UPDATE_COOLDOWN_MS }, now)
    ).toBe(false);
  });
});

describe("isAutoUpdateDisabled", () => {
  it("honors --no-update, env, CI, and non-TTY", () => {
    expect(
      isAutoUpdateDisabled({
        argv: ["info"],
        env: {},
        stdoutIsTTY: true,
      })
    ).toBe(false);

    expect(
      isAutoUpdateDisabled({
        argv: ["info", "--no-update"],
        env: {},
        stdoutIsTTY: true,
      })
    ).toBe(true);

    expect(
      isAutoUpdateDisabled({
        argv: ["info"],
        env: { ALQUIMIA_NO_UPDATE: "1" },
        stdoutIsTTY: true,
      })
    ).toBe(true);

    expect(
      isAutoUpdateDisabled({
        argv: ["info"],
        env: { CI: "true" },
        stdoutIsTTY: true,
      })
    ).toBe(true);

    expect(
      isAutoUpdateDisabled({
        argv: ["info"],
        env: {},
        stdoutIsTTY: false,
      })
    ).toBe(true);
  });
});

describe("cache read/write", () => {
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "alquimia-update-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("round-trips cache json", () => {
    const path = join(dir, "nested", "update-cache.json");
    writeCache(path, { checkedAt: 42, remoteVersion: "0.5.7" });
    expect(readCache(path)).toEqual({
      checkedAt: 42,
      remoteVersion: "0.5.7",
    });
  });

  it("returns null for missing or invalid cache", () => {
    expect(readCache(join(dir, "missing.json"))).toBe(null);
    const bad = join(dir, "bad.json");
    writeFileSync(bad, "{not json", "utf8");
    expect(readCache(bad)).toBe(null);
  });
});

describe("fetchRemoteVersion (mocked)", () => {
  it("parses version from package.json body", async () => {
    const fetchFn = async () => ({
      ok: true,
      text: async () => JSON.stringify({ version: "0.5.7" }),
    });
    await expect(fetchRemoteVersion("https://example.test", { fetchFn })).resolves.toBe(
      "0.5.7"
    );
  });

  it("returns null on HTTP / parse / abort failures", async () => {
    await expect(
      fetchRemoteVersion("https://example.test", {
        fetchFn: async () => ({ ok: false, status: 404 }),
      })
    ).resolves.toBe(null);

    await expect(
      fetchRemoteVersion("https://example.test", {
        fetchFn: async () => ({
          ok: true,
          text: async () => "not-json",
        }),
      })
    ).resolves.toBe(null);

    await expect(
      fetchRemoteVersion("https://example.test", {
        fetchFn: async () => {
          throw new Error("network");
        },
      })
    ).resolves.toBe(null);
  });
});

describe("maybeAutoUpdate (mocked fs/fetch/spawn)", () => {
  let dir;
  let cachePath;
  let logPath;
  let notified;
  let spawns;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "alquimia-auto-"));
    cachePath = join(dir, "update-cache.json");
    logPath = join(dir, "update.log");
    notified = [];
    spawns = [];
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function fakeSpawn(cmd, args) {
    spawns.push({ cmd, args });
    const ee = new EventEmitter();
    ee.unref = () => {};
    ee.once = ee.once.bind(ee);
    // never emits error/close — detached path only cares about spawn
    return ee;
  }

  it("skips when disabled", async () => {
    const result = await maybeAutoUpdate({
      disabled: true,
      cachePath,
      logPath,
      notify: (m) => notified.push(m),
    });
    expect(result).toEqual({
      checked: false,
      updated: false,
      skipped: "disabled",
    });
    expect(spawns).toHaveLength(0);
  });

  it("skips network when cache is fresh", async () => {
    const now = 1_700_000_000_000;
    writeCache(cachePath, { checkedAt: now - 1000, remoteVersion: "0.5.7" });
    let fetched = false;
    const result = await maybeAutoUpdate({
      localVersion: "0.5.5",
      cachePath,
      logPath,
      now,
      fetchFn: async () => {
        fetched = true;
        return { ok: true, text: async () => '{"version":"9.9.9"}' };
      },
      spawnFn: fakeSpawn,
      notify: (m) => notified.push(m),
    });
    expect(result.skipped).toBe("cache");
    expect(fetched).toBe(false);
    expect(spawns).toHaveLength(0);
    expect(notified).toHaveLength(0);
  });

  it("skips spawn/notify when update already in flight", async () => {
    const now = 1_700_000_000_000;
    writeCache(cachePath, {
      checkedAt: now - CHECK_INTERVAL_MS - 1,
      updateStartedAt: now - 1000,
      remoteVersion: "0.5.7",
    });
    const result = await maybeAutoUpdate({
      localVersion: "0.5.5",
      cachePath,
      logPath,
      now,
      fetchFn: async () => ({
        ok: true,
        text: async () => '{"version":"0.5.7"}',
      }),
      spawnFn: fakeSpawn,
      notify: (m) => notified.push(m),
    });
    expect(result.skipped).toBe("in-flight");
    expect(spawns).toHaveLength(0);
    expect(notified).toHaveLength(0);
  });

  it("does not update when remote is not newer", async () => {
    const now = 1_700_000_000_000;
    const result = await maybeAutoUpdate({
      localVersion: "0.5.7",
      cachePath,
      logPath,
      now,
      fetchFn: async () => ({
        ok: true,
        text: async () => '{"version":"0.5.7"}',
      }),
      spawnFn: fakeSpawn,
      notify: (m) => notified.push(m),
    });
    expect(result).toEqual({
      checked: true,
      updated: false,
      skipped: "latest",
    });
    expect(spawns).toHaveLength(0);
    expect(notified).toHaveLength(0);
    const cache = readCache(cachePath);
    expect(cache.remoteVersion).toBe("0.5.7");
    expect(cache.checkedAt).toBe(now);
  });

  it("spawns background install and notifies once when remote is newer", async () => {
    const now = 1_700_000_000_000;
    const npmRoot = join(dir, "node_modules");
    mkdirSync(join(npmRoot, "alquimia"), { recursive: true });
    mkdirSync(join(npmRoot, ".alquimia-abc123"), { recursive: true });

    const result = await maybeAutoUpdate({
      localVersion: "0.5.5",
      cachePath,
      logPath,
      now,
      fetchFn: async () => ({
        ok: true,
        text: async () => '{"version":"0.5.7"}',
      }),
      spawnFn: fakeSpawn,
      spawnSyncFn: fakeSpawnSyncRoot(npmRoot),
      notify: (m) => notified.push(m),
    });
    expect(result).toEqual({ checked: true, updated: true });
    expect(spawns).toHaveLength(1);
    expect(spawns[0].args).toEqual([
      "install",
      "-g",
      "github:Nicolopez603/alquimia-cli",
    ]);
    expect(notified).toEqual(["Actualizando Alquimia en segundo plano…"]);
    const cache = readCache(cachePath);
    expect(cache.updateStartedAt).toBe(now);
    expect(cache.remoteVersion).toBe("0.5.7");
    expect(existsSync(logPath)).toBe(true);
    // Pre-install cleanup removed stale global dirs (Mac ENOTEMPTY).
    expect(existsSync(join(npmRoot, "alquimia"))).toBe(false);
    expect(existsSync(join(npmRoot, ".alquimia-abc123"))).toBe(false);
    expect(readFileSync(logPath, "utf8")).toMatch(/cleaned:/);
  });
});

describe("npm global cleanup (ENOTEMPTY)", () => {
  let dir;
  let npmRoot;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "alquimia-clean-"));
    npmRoot = join(dir, "lib", "node_modules");
    mkdirSync(npmRoot, { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("resolveNpmGlobalRoot prefers npm root -g stdout", () => {
    const root = resolveNpmGlobalRoot({
      spawnSyncFn: fakeSpawnSyncRoot("/custom/lib/node_modules"),
      existsFn: () => false,
      fallbacks: ["/opt/homebrew/lib/node_modules"],
    });
    expect(root).toBe("/custom/lib/node_modules");
  });

  it("resolveNpmGlobalRoot falls back when npm root -g fails", () => {
    const root = resolveNpmGlobalRoot({
      spawnSyncFn: () => ({ status: 1, stdout: "", stderr: "fail" }),
      existsFn: (p) => p === "/opt/homebrew/lib/node_modules",
      fallbacks: [
        "/opt/homebrew/lib/node_modules",
        "/usr/local/lib/node_modules",
      ],
    });
    expect(root).toBe("/opt/homebrew/lib/node_modules");
  });

  it("lists alquimia + .alquimia-* targets only", () => {
    mkdirSync(join(npmRoot, "alquimia"), { recursive: true });
    mkdirSync(join(npmRoot, ".alquimia-xyz"), { recursive: true });
    mkdirSync(join(npmRoot, "other"), { recursive: true });
    writeFileSync(join(npmRoot, ".alquimia-tmp"), "x");

    const targets = globalAlquimiaCleanupTargets(npmRoot);
    expect(targets).toContain(join(npmRoot, "alquimia"));
    expect(targets).toContain(join(npmRoot, ".alquimia-xyz"));
    expect(targets).toContain(join(npmRoot, ".alquimia-tmp"));
    expect(targets).not.toContain(join(npmRoot, "other"));
  });

  it("cleanGlobalAlquimiaInstall removes package and leftovers", () => {
    mkdirSync(join(npmRoot, "alquimia", "bin"), { recursive: true });
    mkdirSync(join(npmRoot, ".alquimia-old"), { recursive: true });
    writeFileSync(join(npmRoot, "keep-me"), "ok");

    const removed = cleanGlobalAlquimiaInstall(npmRoot);
    expect(removed).toEqual(
      expect.arrayContaining([
        join(npmRoot, "alquimia"),
        join(npmRoot, ".alquimia-old"),
      ])
    );
    expect(existsSync(join(npmRoot, "alquimia"))).toBe(false);
    expect(existsSync(join(npmRoot, ".alquimia-old"))).toBe(false);
    expect(existsSync(join(npmRoot, "keep-me"))).toBe(true);
  });

  it("prepareGlobalInstall uses npm root then cleans", () => {
    mkdirSync(join(npmRoot, "alquimia"), { recursive: true });
    const logPath = join(dir, "update.log");
    const { npmRoot: resolved, removed } = prepareGlobalInstall({
      spawnSyncFn: fakeSpawnSyncRoot(npmRoot),
      logPath,
    });
    expect(resolved).toBe(npmRoot);
    expect(removed).toContain(join(npmRoot, "alquimia"));
    expect(existsSync(join(npmRoot, "alquimia"))).toBe(false);
    expect(readFileSync(logPath, "utf8")).toMatch(/cleaned:/);
  });
});

describe("spawnBackgroundUpdate", () => {
  it("cleans then passes detached + log stdio to spawn", () => {
    const dir = mkdtempSync(join(tmpdir(), "alquimia-spawn-"));
    const logPath = join(dir, "update.log");
    const npmRoot = join(dir, "node_modules");
    mkdirSync(join(npmRoot, "alquimia"), { recursive: true });
    mkdirSync(join(npmRoot, ".alquimia-leftover"), { recursive: true });
    const calls = [];
    try {
      const ok = spawnBackgroundUpdate({
        logPath,
        npmCmd: "npm",
        spawnSyncFn: fakeSpawnSyncRoot(npmRoot),
        spawnFn: (cmd, args, opts) => {
          calls.push({ cmd, args, opts });
          const ee = new EventEmitter();
          ee.unref = () => {};
          return ee;
        },
      });
      expect(ok).toBe(true);
      expect(calls).toHaveLength(1);
      expect(calls[0].opts.detached).toBe(true);
      expect(calls[0].args[2]).toBe("github:Nicolopez603/alquimia-cli");
      expect(existsSync(join(npmRoot, "alquimia"))).toBe(false);
      expect(existsSync(join(npmRoot, ".alquimia-leftover"))).toBe(false);
      expect(readFileSync(logPath, "utf8")).toMatch(/auto-update/);
      expect(readFileSync(logPath, "utf8")).toMatch(/cleaned:/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
