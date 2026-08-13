/**
 * Renderer lifecycles.
 *
 * Two shapes cover the whole CLI:
 *
 *   renderStatic(blocks) — paint a document into terminal scrollback and exit.
 *                          Used by every "print and quit" command.
 *   runApp(build)        — full-screen alternate-screen app with keyboard
 *                          input. Used by pickers and the runner.
 *
 * Only one renderer may own stdin/stdout at a time, so both helpers fully
 * destroy their renderer before returning.
 */

import { createCliRenderer, type CliRenderer, type KeyEvent } from "@opentui/core";
import { Document } from "./kit.ts";
import { toPlainText, type Block } from "./doc.ts";

export interface InteractiveOpts {
  stdin?: { isTTY?: boolean; setRawMode?: unknown } | null;
  stdout?: { isTTY?: boolean } | null;
  env?: Record<string, string | undefined>;
  noInteractive?: boolean;
}

const BASE_CONFIG = {
  consoleMode: "disabled",
  exitOnCtrlC: false,
  useMouse: false,
} as const;

/** Whether we can drive a real terminal UI. */
export function isInteractive({
  stdin = process.stdin,
  stdout = process.stdout,
  env = process.env,
  noInteractive = false,
}: InteractiveOpts = {}): boolean {
  if (noInteractive) return false;
  if (env.CI === "true" || env.CI === "1") return false;
  if (!stdin?.isTTY || !stdout?.isTTY) return false;
  return typeof stdin.setRawMode === "function";
}

/**
 * Wait for the terminal to answer OpenTUI's capability probes.
 *
 * On startup OpenTUI interrogates the terminal (DA1, XTVERSION, DECRQM,
 * OSC 10/11, CPR…). Those answers come back asynchronously on stdin. If the
 * renderer is destroyed first, nothing consumes them and they land on the
 * *shell's* stdin instead, which echoes them as line noise like
 * `997;1n;848;704t10;rgb:ffff/…`.
 *
 * Detection settles in ~25 ms, so this is cheap; the timeout only matters for
 * terminals that never answer.
 */
async function drainTerminalHandshake(
  renderer: CliRenderer,
  timeoutMs = 250,
): Promise<void> {
  await renderer.waitForThemeMode(timeoutMs);
}

/**
 * Commit a document to terminal scrollback as styled output, then exit.
 *
 * Uses split-footer mode because it is the only screen mode with a
 * programmatic scrollback append path.
 *
 * `clearOnShutdown: false` matters here: the default teardown erases the
 * renderer-owned region, which on the main screen wipes the terminal instead
 * of just retiring the one-row footer.
 */
export async function renderStatic(blocks: readonly Block[]): Promise<void> {
  const renderer = await createCliRenderer({
    ...BASE_CONFIG,
    screenMode: "split-footer",
    footerHeight: 1,
    externalOutputMode: "capture-stdout",
    exitSignals: ["SIGTERM", "SIGHUP"],
    useKittyKeyboard: null,
    clearOnShutdown: false,
  });

  try {
    const surface = renderer.createScrollbackSurface({ startOnNewLine: true });
    surface.root.add(Document(blocks));
    surface.render();

    const height = Math.max(1, surface.height);
    surface.commitRows(0, height);
    surface.destroy();

    await renderer.idle();
    await drainTerminalHandshake(renderer);
  } finally {
    renderer.destroy();
  }
}

/** Print a document: styled in a terminal, plain text everywhere else. */
export async function printDoc(
  blocks: readonly Block[],
  { plain = false }: { plain?: boolean } = {},
): Promise<void> {
  if (plain || !isInteractive()) {
    const out = toPlainText(blocks);
    if (out) console.log(out);
    return;
  }
  await renderStatic(blocks);
}

/**
 * Run a full-screen OpenTUI app on the alternate screen.
 *
 * `build` receives the renderer plus an `exit(value)` callback; the promise
 * resolves with whatever `exit` was called with (or `undefined` if the user
 * quit with Ctrl+C).
 *
 */
export async function runApp<T>(
  build: (ctx: {
    renderer: CliRenderer;
    exit: (value?: T | null) => void;
  }) => void | Promise<void>,
  { targetFps }: { targetFps?: number } = {},
): Promise<T | null | undefined> {
  const renderer = await createCliRenderer({
    ...BASE_CONFIG,
    screenMode: "alternate-screen",
    ...(targetFps ? { targetFps } : {}),
  });

  let settle!: (value: T | null | undefined) => void;
  const done = new Promise<T | null | undefined>((resolve) => {
    settle = resolve;
  });

  let settled = false;
  const exit = (value?: T | null) => {
    if (settled) return;
    settled = true;
    settle(value);
  };

  renderer.keyInput.on("keypress", (key: KeyEvent) => {
    if (key.ctrl && key.name === "c") exit(undefined);
  });

  // OpenTUI tears the renderer down on SIGTERM/SIGHUP but cannot know how the
  // app wants to finish. Without this the promise never settles and the
  // process hangs after a `kill`.
  renderer.on("destroy", () => exit(undefined));

  try {
    await build({ renderer, exit });
    return await done;
  } finally {
    // A screen the user dismisses immediately can still outrun the probes.
    await drainTerminalHandshake(renderer);
    renderer.destroy();
  }
}
