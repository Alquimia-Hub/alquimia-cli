# CLAUDE.md

Alquimia CLI — community CLI (Spanish/rioplatense UI copy) built as a terminal UI on **OpenTUI**, written in **TypeScript**.

## Runtime: Bun only

The UI uses `@opentui/core`, whose renderer needs native FFI. **Bun provides it; Node does not** (Node would need 26.4.0 with `--experimental-ffi`, which an npm global bin shim cannot pass). `bin/alquimia.ts` detects a missing `Bun` global and exits 1 with an install hint rather than crashing inside the renderer.

- Run: `bun bin/alquimia.ts <cmd>` · Test: `bun test` · Types: `bun run typecheck`
- **Two entry points.** `bin/alquimia.js` is the published `bin`: plain JS, `#!/usr/bin/env node`, because `npx` always launches with Node. It locates Bun and re-execs `bin/alquimia.ts`, which is the real entry. Never make `bin/alquimia.js` TypeScript or give it a `bun` shebang — that breaks `npx` with a bare `env: bun: No such file or directory`.
- Bun itself is an **optionalDependency** (`bun` on npm, platform binaries via `@oven/*`), which is what makes `npx alquimia-cli` work with nothing preinstalled.
- The bootstrap **verifies each Bun candidate by running `--version`**: the `bun` package ships a placeholder at `bin/bun.exe` that exists but is a shell script when its postinstall was skipped (`--ignore-scripts`).
- **No build step.** Bun executes `.ts` directly, so `tsc` is only ever a checker (`noEmit`). Never add a `dist/` compile step to run the CLI.
- Relative imports use explicit **`.ts`** extensions (`allowImportingTsExtensions`). Keep them.
- The package is **`alquimia-cli`** on npm — plain `alquimia` is taken by an unrelated package. `src/update.ts` stays npm-based on purpose.
- `scripts/postinstall.js` stays **plain JavaScript**: npm runs it under Node, which cannot load TypeScript. It must never import from `src/` — it reads `src/commands.json`, the shared data file `src/commands.ts` also imports.

## Architecture

Command logic and pixels are kept apart. Everything user-visible flows through a document model with two backends.

```
bin/alquimia.ts      Bun guard → src/cli.ts
src/cli.ts           arg parsing + command routing
src/types.ts         shared domain types (Community, Tool, ArtPrefs, TerminalId…)
src/ui/doc.ts        document model + Block union
                     + toPlainLines() — the plain-text backend
src/ui/kit.ts        the OpenTUI backend: blocks → Box/Text/ASCIIFont constructs
src/ui/views.ts      one builder per screen (helpView, infoView, toolsView, …)
src/ui/app.ts        renderer lifecycles: renderStatic / printDoc / runApp
src/ui/picker.ts     promptSelect<T> / promptConfirm
src/ui/dino.ts       Alquimia Runner view (FrameBuffer)
src/ui/style.ts      StyledText helpers (`style.green("✓")`, `t` template)
src/ui/report.ts     buffered emit()/emitErr()/flushReport() for status lines
src/ui/theme.ts      palette + tones — the only place hex colors live
src/dino/engine.ts   pure game physics/sprites, no renderer
src/commands.json    command list — shared with the Node postinstall script
```

Bare `alquimia` on a TTY opens the **home launcher** (`pickHomeCommand()` in `src/cli.ts`): a picker that resolves to a command name, which is then fed into the normal dispatch chain — so every command has exactly one implementation. Piped, in CI, or with `--no-interactive` it still prints plain help, and `alquimia help` stays static either way.

**The rule:** a view builds blocks and knows nothing about renderers. That is what makes `alquimia info` render richly in a terminal and stay greppable when piped — without any screen being written twice.

## The two renderer lifecycles

`renderStatic(blocks)` — "print and quit" commands. Uses `screenMode: "split-footer"` + `createScrollbackSurface()`, because that is OpenTUI's only programmatic scrollback-append path. The surface measures content height (it is **not** capped to the viewport), commits the rows, and the 1-row footer is cleared on shutdown. Do not switch this to `main-screen`: that mode reserves the full terminal height and would leave a large blank block behind.

`runApp(build)` — alternate-screen interactive apps (pickers, the runner). `build` gets `{ renderer, exit }`; the promise resolves with whatever `exit` was called with. It also resolves on the renderer's `destroy` event, otherwise a `kill` tears down the renderer but leaves the promise pending and the process hangs.

Only one renderer can own stdin/stdout at a time, so both helpers fully destroy their renderer before returning. Nested flows (sections → tools → actions) each open their own `runApp`.

## Typing conventions

- **Domain shapes live in `src/types.ts`.** `Block`/`Tone` live in `src/ui/doc.ts` because they are the UI contract.
- **`Block` is a discriminated union on `t`.** Adding a block type means updating the union, `toPlainLines()`, and `renderBlock()` — the compiler will point at all three.
- **Pickers are generic:** `promptSelect<T>(renderer, { options: PickerOption<T>[] })` returns `PickerResult<T> | null`, so `option.value` stays typed end to end. `runApp<T>` likewise carries the exit value's type.
- **Seam types describe what the module uses, not Node's full API.** `SpawnLike`, `SpawnSyncLike` and `FetchLike` in `src/update.ts` exist because `typeof spawn`/`typeof fetch` are overloaded types no test double can satisfy. Prefer a narrow seam over `as any` at every call site.
- **Backend option bags** (`BackendOpts`, `ReloadOpts`, `AppleTerminalOpts`, `DoctorOpts`) carry an index signature: these terminals each need their own extras, and one interface per terminal would be noise. Callable injectables are still declared explicitly — otherwise the index signature makes them `unknown` and uncallable.
- `ArtBackendResult` is the shared contract for every `set*`/`clear*Background`. Annotate the return type explicitly; without it TS infers a per-branch union that drops fields callers read.

## Conventions that matter

- **Machine output bypasses the UI entirely.** `--json`, `art --path`, and `completion <shell>` write to raw stdout via `console.log` / `process.stdout.write`. Never route those through `printDoc`.
- **stderr stays plain text.** `emitErr()` writes unstyled to stderr so `2>` redirection and `grep` keep working. Only stdout goes through OpenTUI.
- **`printDoc` auto-degrades.** Non-TTY, CI, or `--no-interactive` → plain text. Check with `isInteractive()`.
- **Colors come from `src/ui/theme.ts`.** Views name a tone (`muted`, `accent`, `good`, `warn`, `bad`, `brand`), never a hex.
- **Buffered status lines need a flush.** Anything using `emit()` must `await flushReport()` on every exit path — `runArt` wraps `runArtInner` in `try/finally` for exactly this reason.
- **The picker is intentionally unfocused.** A focused `SelectRenderable` binds `j`/`k` to navigation, which would swallow those letters from type-to-filter. `promptSelect` drives `setSelectedIndex`/`moveUp`/`moveDown` manually instead.

## Testing

`bun test` (149 tests, `.test.ts`). Component tests use `createTestRenderer` from `@opentui/core/testing` with `mockInput`, asserting on `captureCharFrame()`.

`bun run typecheck` must stay at zero errors.

A lone `Escape` is ambiguous without the Kitty keyboard protocol — the test renderer merges it into the next key. Tests that press Escape must pass `kittyKeyboard: true`.

## Terminal handshake (do not regress this)

On startup OpenTUI probes the terminal — DA1, XTVERSION, DECRQM, OSC 10/11, CPR, XTWINOPS — and the answers arrive **asynchronously on stdin**. A one-shot command that destroys its renderer immediately never consumes them, so they land on the *shell's* stdin and get echoed as line noise (`997;1n;848;704t10;rgb:ffff/…`). Most visible in embedded terminals (VS Code / Cursor use xterm.js).

Both lifecycles therefore call `drainTerminalHandshake()` before `destroy()`. Detection settles in ~25 ms; the 250 ms timeout only bounds terminals that never answer.

`renderStatic` also sets **`clearOnShutdown: false`**. The default teardown erases the renderer-owned region, which on the main screen wipes the terminal rather than just retiring the one-row footer.

Verify with the pty harness — the in-memory test renderer skips terminal setup, so `bun test` cannot catch this:

```bash
OTUI_STDIN_LOG=/tmp/in.bin python3 tools/ptyprobe.py bun bin/alquimia.ts help
wc -c /tmp/in.bin     # must be > 0; 0 means the replies leaked
```

## Releasing

`npm version <patch|minor|major>` + `git push --follow-tags`. The `publish.yml` workflow fires on `v*` tags, and refuses to publish when the tag and `package.json` disagree. `prepublishOnly` runs typecheck + tests, so a manual `npm publish` is guarded too.

`INSTALL_SPEC` in `src/update.ts` is the npm package name (`alquimia-cli`), not a github spec — the auto-updater installs from the registry. `globalAlquimiaCleanupTargets()` clears both `alquimia-cli` and the legacy `alquimia` directory so upgrades from github-installed copies do not leave a stale package behind.

## Gotchas

- `t` is the OpenTUI template tag. Do not shadow it with a local `t` in `.map((t) => …)`.
- `Box`/`Text` are **construct factories** returning VNodes; `BoxRenderable`/`TextRenderable` are classes taking `(renderer, opts)`. Use the classes when you need an imperative handle (e.g. mutating `.content` or `.options`).
- Two-column `kv` rows need `width` + `flexShrink: 0` on the key, or Yoga squeezes the column and the layout goes ragged.
- The runner keeps braille (2×4 subpixels per cell) from the engine and blits it into a `FrameBufferRenderable`, coloring per role. Engine stays renderer-free so physics is testable.
- OpenTUI's `SelectOption.description` is **required**; `PickerOption.description` is optional. `toSelectOptions()` normalizes at the boundary — don't push the requirement onto callers.
- `bun build --compile` bundles the code but the CLI also reads on-disk assets (`completions/`, `assets/art.png`, the Swift helper). A standalone binary needs asset embedding first; that's why there is no `build` script.
