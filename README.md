<div align="center">

```
   (                    *
      ╔═╗╦  ╔═╗ ╦ ╦╦╔╦╗╦╔═╗
      ╠═╣║  ║═╬╗║ ║║║║║║╠═╣
      ╩ ╩╩═╝╚═╝╚╚═╝╩╩ ╩╩╩ ╩
             /\
            /  \
           / .  \
          /______\
```

**La CLI de la comunidad [Alquimia](https://alquimia.community/)**
IA, automatización y productividad — en tu terminal.

[![npx](https://img.shields.io/badge/npx-alquimia--cli-CB3837?logo=npm&logoColor=white)](https://www.npmjs.com/package/alquimia-cli)
[![Bun](https://img.shields.io/badge/runtime-Bun-black?logo=bun)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](tsconfig.json)
[![OpenTUI](https://img.shields.io/badge/UI-OpenTUI-5BC8CF)](https://opentui.dev)
[![Tests](https://img.shields.io/badge/tests-149%20passing-6FCF7F)](#testing)
[![License](https://img.shields.io/badge/license-MIT-E8B84B)](LICENSE)

[Cómo correrlo](#cómo-correrlo) · [Comandos](#comandos) · [Brand art](#brand-art) · [Arquitectura](#arquitectura) · [Desarrollo](#desarrollo)

</div>

---

## Qué es

`alquimia` es una TUI: navegás con las flechas, filtrás escribiendo y abrís links sin salir de la terminal. La UI está construida sobre [OpenTUI](https://opentui.dev) — layout flexbox real, canvas nativo y colores de marca. Todo el código es **TypeScript estricto**, que Bun ejecuta directo (sin build).

Y cuando algo tarda en instalar, jugás al **Alquimia Runner** mientras esperás.

```
 ▄▀█ █   █▀█ █ █ █ █▀▄▀█ █ ▄▀█
 █▀█ █▄▄ ▀▀█ █▄█ █ █ ▀ █ █ █▀█

 Catálogo de tools
 Recomendaciones de la comunidad · elegí una sección

 Filtro: agen
  ▶ Herramientas de agentes
    Coding agents para el día a día
    Harnesses / managers
    Managers, configuradores y orquestación de agents

 ╭──────────────────────────────────────────────────────────────╮
 │ ↑↓ elegí · Enter abrí · escribí para filtrar · Esc limpia    │
 ╰──────────────────────────────────────────────────────────────╯
```

## Cómo correrlo

> [!NOTE]
> Internamente corre sobre [Bun](https://bun.sh), porque la UI usa OpenTUI y necesita FFI nativo que Node no da. **No tenés que instalarlo vos**: viene como dependencia opcional y el bootstrap lo resuelve solo.

### Sin instalar nada

```bash
npx alquimia-cli
```

Eso es todo. `npx` baja el paquete (289 KB) y, si no tenés Bun, también el binario de Bun (~60-90 MB según la plataforma, cacheado después). El bin es un bootstrap de Node que encuentra Bun y re-ejecuta la CLI, así que funciona aunque nunca hayas oído hablar de Bun.

```bash
bunx alquimia-cli     # si ya tenés Bun (más rápido, sin bajar el binario)
```

### Instalada

```bash
npm install -g alquimia-cli
alquimia
```

### Desde el repo (desarrollo)

No hay paso de build: **Bun ejecuta los `.ts` directo**.

```bash
git clone https://github.com/Alquimia-Hub/alquimia-cli.git
cd alquimia-cli
bun install

bun bin/alquimia.ts              # = alquimia (help)
bun bin/alquimia.ts tools        # la TUI completa
bun bin/alquimia.ts dino         # el runner
bun start                        # atajo de package.json
```

| Comando | Qué hace |
|---|---|
| `bun bin/alquimia.ts <cmd>` | Correr cualquier comando desde el repo |
| `bun test` | Suite completa (149 tests) |
| `bun test --watch` | Tests en watch |
| `bun run typecheck` | `tsc --noEmit` — debe quedar en 0 errores |
| `bun start` / `bun run dino` | Atajos |

> [!TIP]
> `tsc` acá es **solo un chequeador** (`noEmit`). No hay `dist/`, no hay paso de compilación: si agregás un `.ts`, se corre solo.

<details>
<summary>¿Cómo corre sobre Bun si yo tengo Node?</summary>

El `bin` del paquete (`bin/alquimia.js`) es JavaScript plano que Node puede parsear — necesario porque `npx` siempre arranca el bin con Node. Ese bootstrap busca Bun en este orden y **verifica cada candidato ejecutándolo**:

1. ya estás corriendo bajo Bun → importa la CLI directo, sin proceso extra
2. `ALQUIMIA_BUN` (override explícito)
3. `bun` en el PATH
4. el paquete `bun` (optional dependency) o su binario de plataforma en `@oven/*`

Si no encuentra ninguno, imprime cómo instalarlo en vez del críptico `env: bun: No such file or directory`.

Si en Mac ves `ENOTEMPTY` al actualizar global:

```bash
rm -rf "$(npm root -g)/alquimia-cli" "$(npm root -g)"/.alquimia-* \
  && npm install -g alquimia-cli
```

(`alquimia update` y el auto-update hacen ese cleanup solos.)

</details>

Arrancá con `alquimia info` o `alquimia help`.

## El launcher

`alquimia` sin argumentos abre un **menú interactivo**: elegís con ↑↓, filtrás escribiendo, Enter entra y Esc/`q` sale.

```bash
alquimia            # menú
bun start           # lo mismo desde el repo
```

Si lo pipeás, corrés en CI o pasás `--no-interactive`, imprime la ayuda en texto plano — los scripts siguen funcionando igual. `alquimia help` siempre es estático.

## Comandos

Cualquiera de estos se puede llamar directo, sin pasar por el menú:

| Comando | Qué hace |
|---|---|
| `info` | La comunidad, las redes y un cheat-sheet de comandos |
| `join` | Menú para sumarte: Discord (recomendado), WhatsApp, X, GitHub o la web |
| `events` | Community calls de lun/mié 17:00 ARG — Enter abre el evento en Discord |
| `tools` | Catálogo navegable: **sección → tool → acción** (abrir docs o instalar) |
| `art` | Fondo de terminal con el brand art |
| `doctor` | Diagnóstico del entorno (Bun, binario, terminal, prefs, auto-update) |
| `open <red>` | Abrí una red puntual en el navegador |
| `dino` | Alquimia Runner: endless runner en braille |
| `update` | Actualizá la CLI ahora |
| `completion <shell>` | Script de completion para zsh / bash / fish |
| `help` · `version` | Ayuda y versión |

### Flags globales

| Flag | Efecto |
|---|---|
| `--json` | Salida machine-readable a stdout crudo (pipeable a `jq`) |
| `--list` | Solo listar, sin menú interactivo |
| `--no-interactive` | Nunca abrir TUI ni correr installs |
| `--no-banner` | Omitir el wordmark |
| `--no-update` | Saltear el auto-update (o `ALQUIMIA_NO_UPDATE=1`) |
| `--yes` / `-y` | Saltear la confirmación de install en `tools` |

> [!TIP]
> Todo comando detecta si está en una terminal. Con TTY vas a ver la UI completa; en un pipe, CI o con `--no-interactive`, la misma pantalla sale como texto plano y greppeable. `alquimia info | grep Discord` sigue funcionando.

## Screens

### `tools` — el flujo principal

1. **Sección** → **tool** → **acción**
2. Acciones: **Abrir repo / docs** y, si la tool tiene `install` en el catálogo, **Instalar**
3. Instalar pregunta **dónde**: **Global** o **En este proyecto**
4. Antes de correr, confirmás (o usá `--yes`)
5. En los pickers de sección y tool, **escribí para filtrar**. Backspace edita; Esc limpia el filtro o vuelve un nivel

Los comandos de install son **strings estáticos del catálogo** (`src/tools.ts`) — nunca se evalúa input remoto.

```bash
alquimia tools              # navegación completa
alquimia tools agents       # saltar directo a una sección
alquimia tools --list       # listado plano
alquimia tools --json       # catálogo + metadata de install
```

### `events`

```bash
alquimia events             # picker; Enter abre el evento en Discord
alquimia events --open      # abrir la próxima call sin menú
alquimia events --list
alquimia events --json
```

### `dino` — Alquimia Runner

Un endless runner original con **canvas braille** (U+2800, 2×4 px por celda) dibujado en un `FrameBuffer` de OpenTUI. Sprites propios — no es el dino de Chrome.

```bash
alquimia dino
```

**Espacio** / **↑** saltás · **q** / **Esc** salís · **Enter** reiniciás. El récord se guarda en `~/.local/share/alquimia/dino-hiscore.json`.

También corre en paralelo durante installs largos de `tools` y durante `alquimia update`. Se saltea con `--no-interactive`, `CI=true` o `ALQUIMIA_NO_DINO=1`.

### `doctor`

```bash
alquimia doctor
alquimia doctor --json
```

Versión de Bun y de la CLI, path del binario, soft-check de installs duplicados (Homebrew vs nvm), terminal detectada y si `art` aplica, prefs de art, config de Ghostty y estado del auto-update.

### `completion`

```bash
alquimia completion zsh  > ~/.zsh/completions/_alquimia
alquimia completion bash > ~/.local/share/bash-completion/completions/alquimia
alquimia completion fish > ~/.config/fish/completions/alquimia.fish

eval "$(alquimia completion zsh)"   # o en la sesión actual
```

## Auto-update

Al arrancar en una terminal interactiva, `alquimia` chequea ~1 vez por hora si hay una versión más nueva y, si hace falta, instala en **segundo plano**. El comando actual sigue con la versión ya cargada.

- Mensaje único: `Actualizando Alquimia en segundo plano…`
- Cache / log: `~/.alquimia/update-cache.json` y `~/.alquimia/update.log`
- Desactivá con `--no-update`, `ALQUIMIA_NO_UPDATE=1`, o automáticamente en CI / sin TTY

## Brand art

Setear el fondo de terminal **no es universal**. `alquimia art` detecta la terminal y usa un mecanismo real — o te dice honestamente que no puede.

```bash
alquimia art                  # usa prefs guardadas o defaults
alquimia art --opacity 0.28   # 0..1 · se guarda
alquimia art --fit cover      # cover|contain|stretch · se guarda
alquimia art --clear          # saca el fondo (mantiene prefs)
alquimia art --open           # abrir el PNG
alquimia art --path           # imprimir la ruta (stdout crudo)
```

Prefs en `~/.local/share/alquimia/art-prefs.json` (defaults: opacity `0.28`, fit `cover`). El PNG se copia a `~/.local/share/alquimia/art.png` para que los paths sobrevivan un update.

<details>
<summary>Soporte por terminal</summary>

| Terminal | OS | Método | ¿Reload? |
|---|---|---|---|
| **iTerm2** | macOS | OSC 1337 `SetBackgroundImageFile` | No (live) |
| **Kitty** | macOS/Linux | `kitty @ set-background-image` | No (remote control) |
| **Ghostty** | macOS/Linux | Bloque `# BEGIN/END alquimia-art` en config — auto-reload vía SIGUSR2 (1.2+), fallback macOS ⌘⇧, | Auto cuando se puede |
| **Terminal.app** | macOS | Perfil `Alquimia` con `BackgroundImageBookmark` (helper Swift) + AppleScript | Switch de perfil (live) |
| **WezTerm** | macOS/Linux | `~/.wezterm.lua` `config.background` con `Cover` | Auto / Ctrl+Shift+R |
| **Contour** | macOS/Linux | `contour.yml` `background_image` | Reiniciar ventana |
| **Tilix** | Linux | `gsettings` | No |
| **Terminology** | Linux | `tybg` | No |
| **Hyper** | macOS/Linux | `.hyper.js` CSS | Auto / reiniciar |
| **Tabby** | macOS/Linux | `config.yaml` `appearance.css` | Reiniciar / Acrylic on |
| **Windows Terminal** | Windows / WSL | `settings.json` `backgroundImage` | Guardar settings |

**Sin soporte real** (mensaje honesto + `--open`): Alacritty, VS Code/Cursor integrated, GNOME Terminal/Ptyxis, Konsole, xterm/st/foot, tmux/screen solos.

</details>

## Arquitectura

La lógica y los píxeles viven separados. Cada pantalla arma un **documento** de bloques, y ese documento se renderiza por dos backends distintos:

```
                    ┌── src/ui/kit.ts ──→ OpenTUI (Box/Text/ASCIIFont)   TTY
src/ui/views.ts ──→ │
   (bloques)        └── toPlainLines() ─→ texto plano                    pipe / CI
```

Por eso ninguna pantalla se escribe dos veces, y `--json` / pipes nunca se ensucian con escapes.

| Módulo | Rol |
|---|---|
| `src/types.ts` | Tipos del dominio compartidos |
| `src/ui/doc.ts` | Modelo de documento (`Block`) + backend de texto plano |
| `src/ui/kit.ts` | Backend OpenTUI (bloques → constructs) |
| `src/ui/views.ts` | Un builder por pantalla |
| `src/ui/app.ts` | Ciclos de vida del renderer (`renderStatic`, `runApp`) |
| `src/ui/picker.ts` | `promptSelect<T>` / `promptConfirm` |
| `src/ui/dino.ts` | Vista del runner sobre `FrameBuffer` |
| `src/ui/theme.ts` | Paleta — el único lugar con hex |
| `src/dino/engine.ts` | Física pura del juego, sin renderer |
| `src/community.ts` · `src/tools.ts` | Datos: links, agenda, catálogo |

### Qué usamos de OpenTUI

| API | Para qué |
|---|---|
| `createCliRenderer` | Dos modos: `split-footer` + `createScrollbackSurface()` para imprimir y salir; `alternate-screen` para pantallas interactivas |
| `Box` · `Text` · `ASCIIFont` | Layout flexbox, paneles con borde y el wordmark |
| `SelectRenderable` | Pickers con descripciones y scroll indicator |
| `FrameBufferRenderable` + `RGBA` | Canvas del Alquimia Runner |
| `t` · `bold` · `dim` · `fg` (`StyledText`) | Estilos inline — reemplazan los códigos ANSI a mano |
| `renderer.keyInput` | Teclado: flechas, Enter, Esc, y type-to-filter |
| `@opentui/core/testing` | `createTestRenderer` + `mockInput` para tests de UI |

## Publicar

No se publica solo: hay que **empujar un tag**. El workflow hace el resto.

```bash
npm version patch     # o minor / major → bumpea package.json y crea el tag vX.Y.Z
git push --follow-tags
```

`.github/workflows/publish.yml` corre con el tag: instala, `typecheck`, `test`, verifica que **el tag coincida con `package.json`** y publica con `--provenance` (npm muestra el badge de build verificado).

Setup una sola vez, uno de los dos:

- **Trusted publishing (recomendado, sin secretos):** en npmjs.com → paquete → Settings → Trusted Publisher → GitHub Actions, repo `Alquimia-Hub/alquimia-cli`, workflow `publish.yml`. Después borrá `NODE_AUTH_TOKEN` del workflow.
- **Token clásico:** npmjs.com → Access Tokens → Automation → guardalo como secret `NPM_TOKEN` en el repo.

La primera publicación tiene que ser manual, para reclamar el nombre:

```bash
npm login
npm publish --access public
```

`prepublishOnly` corre `typecheck` + `test` antes de cualquier publish, así que un `npm publish` a mano tampoco puede subir algo roto.

`.github/workflows/ci.yml` corre en cada push y PR: typecheck, tests, y un smoke del bootstrap con Node (que es como lo arranca `npx`).

## Desarrollo

### Testing

```bash
bun test           # 149 tests
bun test --watch
bun run typecheck  # 0 errores
```

Los tests de UI usan `createTestRenderer` de `@opentui/core/testing`: montan un componente real, simulan teclas con `mockInput` y asertan sobre el frame capturado. Los de lógica (agenda, semver del auto-update, prefs de art, física del runner) corren sin renderer.

### Terminal handshake

OpenTUI interroga a la terminal al arrancar y las respuestas llegan async por stdin. Si el proceso sale antes de consumirlas, terminan en el shell como ruido (`997;1n;848;704t10;rgb:…`), sobre todo en terminales embebidas (VS Code / Cursor). Por eso los dos ciclos de vida drenan el handshake antes de `destroy()`.

Los tests usan el renderer en memoria, que saltea el setup de terminal — así que esto se verifica con un pty real:

```bash
OTUI_STDIN_LOG=/tmp/in.bin python3 tools/ptyprobe.py bun bin/alquimia.ts help
wc -c /tmp/in.bin     # > 0 = ok; 0 = las respuestas se filtraron
```

### TypeScript

Estricto, sin build. Puntos de diseño:

- **`src/types.ts`** concentra las formas del dominio (`Community`, `Tool`, `ArtPrefs`, `TerminalId`…).
- **`Block` es una unión discriminada** por `t`: agregar un tipo de bloque hace que el compilador te marque los tres lugares a tocar (unión, backend de texto, backend OpenTUI).
- **Los pickers son genéricos**: `promptSelect<T>()` devuelve `PickerResult<T> | null`, así `option.value` llega tipado hasta el call site.
- **Los seams de test se tipan por lo que se usa**, no por la API completa de Node (`SpawnLike`, `FetchLike`) — los tipos sobrecargados de `spawn`/`fetch` no los puede satisfacer ningún doble de test.
- Los imports relativos llevan extensión **`.ts`** explícita.

> [!NOTE]
> No hay script de `build`. `bun build --compile` empaqueta el código, pero la CLI también lee assets del disco (`completions/`, `assets/art.png`, el helper Swift) que un binario standalone no ve sin embeber assets.

Ver [`CLAUDE.md`](CLAUDE.md) para las convenciones internas.

## Changelog

- **0.6.0** — **Migración completa a OpenTUI + TypeScript.** Todo el código pasó a TS estricto (`bun run typecheck` en 0 errores), ejecutado directo por Bun sin paso de build; tipos de dominio en `src/types.ts`, `Block` como unión discriminada y pickers genéricos. La CLI ahora es una TUI que corre sobre Bun. Nuevo modelo de documento con backends TTY / texto plano (`src/ui/`), pickers sobre `SelectRenderable` con type-to-filter, Alquimia Runner sobre `FrameBuffer`, estilos vía `StyledText` en lugar de ANSI a mano. Se eliminaron `src/style.js`, `src/select.js` y `src/banner.js`. Tests migrados a `bun test` + `@opentui/core/testing`.
- **0.5.18** — Alquimia Runner UI: canvas braille denso, sprites pixel-art, HUD + hi-score, overlay de game over.
- **0.5.17** — `alquimia dino`: runner TTY original; corre en paralelo durante `tools` install y `update`.
- **0.5.15** — Help global más corto: tagline + Uso + Comandos.
- **0.5.14** — `alquimia doctor`, prefs de art (`--opacity` / `--fit`), completions zsh/bash/fish, filtro type-to-search en `tools`.
- **0.5.13** — Ghostty: `background-image-fit = cover` + opacity default 0.28.
- **0.5.12** — Ghostty auto-reload (SIGUSR2 / ⌘⇧,); soporte Terminal.app por perfil.
- **0.5.11** — `alquimia art` multi-terminal (iTerm2, Kitty, Ghostty, WezTerm, Contour, Tilix, Terminology, Hyper, Tabby, Windows Terminal).
- **0.5.9** — Auto-update silencioso al arrancar.
- **0.5.8** — `alquimia art`: fondo de terminal con brand art.

## License

MIT © [Alquimia Hub](https://github.com/Alquimia-Hub)

<div align="center">
<sub>Hecho por la comunidad, para la comunidad · <a href="https://discord.gg/wkhHrWZC3Q">Discord</a> · <a href="https://alquimia.community/">alquimia.community</a></sub>
</div>
