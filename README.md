# alquimia

CLI de la comunidad [Alquimia](https://alquimia.community/) — IA, automatización y productividad.

## Install

Desde el home actual del repo:

```bash
npm install -g github:Alquimia-Hub/alquimia-cli
```

Requiere **Node.js 18+**.

Si en Mac ves `ENOTEMPTY` al renombrar `/opt/homebrew/lib/node_modules/alquimia`, limpiá e instalá de nuevo:

```bash
rm -rf "$(npm root -g)/alquimia" "$(npm root -g)"/.alquimia-* && npm install -g github:Alquimia-Hub/alquimia-cli
```

(`alquimia update` y el auto-update hacen ese cleanup solos antes del `npm install -g`.)

Después del install vas a ver un tip con los comandos. Resumen (fuente: `src/commands.js`):

```
Comandos
  info        Qué es Alquimia, la descripción de la comunidad y links a web, GitHub, X, Discord y WhatsApp
  join        Menú para sumarte; abrí Discord (recomendado), WhatsApp, X, GitHub o la web
  events      Calls de lun/mié 17:00 ARG; en TTY elegí con ↑↓ y Enter abre el evento en Discord
  tools       Catálogo de tools; en TTY: sección → tool → acción. Escribí para filtrar
  art         Fondo de terminal con brand art; `--opacity` / `--fit` se guardan; `--clear` lo saca
  doctor      Diagnóstico del entorno (Node, binario, terminal/art, prefs, Ghostty, auto-update)
  open        Abrí una red puntual en el navegador (`open discord`, `open x`, etc.)
  update      Actualizá la CLI ahora (también se auto-actualiza en segundo plano al arrancar)
  completion  Imprimí completion zsh|bash|fish
  help        Mostrá esta ayuda
  version     Versión instalada de la CLI
```

Empezá con `alquimia info` o `alquimia help`.

### Auto-update

Al arrancar en una terminal interactiva (TTY), `alquimia` chequea ~1 vez por hora si hay una versión más nueva en GitHub y, si hace falta, lanza `npm install -g github:Alquimia-Hub/alquimia-cli` en **segundo plano**. El comando actual sigue con la versión ya cargada; la próxima invocación usa la nueva.

Antes del install borra `(npm root -g)/alquimia` y los leftovers `(npm root -g)/.alquimia-*` para evitar el `ENOTEMPTY` típico de Homebrew en Mac.

- Mensaje único (dim): `Actualizando Alquimia en segundo plano…`
- Cache / log: `~/.alquimia/update-cache.json` y `~/.alquimia/update.log`
- Desactivá con `--no-update`, `ALQUIMIA_NO_UPDATE=1`, o automáticamente en `CI=true` / sin TTY

Para forzar la actualización en primer plano:

```bash
alquimia update
```

## Usage

Sin argumentos (o con `-h` / `--help`) muestra la ayuda, con un banner ASCII (wordmark + triángulo) arriba:

```bash
alquimia
alquimia --help
```

Usá `--no-banner` en `help` / `info` / `join` / `events` / `tools` si preferís omitirlo. Usá `--no-update` (o `ALQUIMIA_NO_UPDATE=1`) para saltear el auto-update.

### info

Descripción de la comunidad, links a las redes y un cheat-sheet de comandos (incluye el banner en salida humana):

```bash
alquimia info
```

Salida machine-readable (sin banner ni cheat-sheet):

```bash
alquimia info --json
```

### open

Abrí una red en el navegador por defecto:

```bash
alquimia open web
alquimia open github
alquimia open twitter
alquimia open discord
alquimia open whatsapp
```

Alias útiles:

| Alias | Destino   |
|-------|-----------|
| `site` | web      |
| `x`    | twitter  |
| `gh`   | github   |
| `wa`   | whatsapp |

### join

Menú para sumarte a la comunidad. En una terminal interactiva te pide un número (Enter = Discord). Sin TTY o con `--json`, solo lista las opciones:

```bash
alquimia join
alquimia join --json
alquimia join discord
alquimia join wa
```

### events

Community calls recurrentes (lunes y miércoles 17:00 ARG / UTC-3, en Discord). Destaca la próxima call.

En una terminal interactiva (TTY) podés moverte con ↑↓ y con Enter se abre el **evento de Discord** de esa call. Esc / `q` / Ctrl+C cancela. Sin TTY, con `--json`, `--list` o `--no-interactive`, solo lista (sin raw mode). `--open` abre la próxima call sin menú:

```bash
alquimia events
alquimia events --open
alquimia events --list
alquimia events --json
alquimia events --no-banner
```

### tools

Catálogo anidado de herramientas recomendadas por la comunidad, agrupadas por tipo (terminal, agents, harnesses, skills, diseño, testing).

En TTY el flujo es:

1. **Sección** → **tool** → **acción**
2. Acciones: **Abrir repo / docs** (abre `tool.url`) y, si la tool tiene `install` en el catálogo, **Instalar**
3. Si elegís Instalar: **dónde** — **Global** (`install.global`) o **En este proyecto** (`install.project`). Si el path no está configurado, te lo dice y ofrece la otra opción o abrir docs
4. Antes de correr el comando, confirmás con **Ejecutar** / **Cancelar** (o usá `--yes` / `-y` para saltear)
5. En los pickers de **sección** y **tool** podés **escribir para filtrar** (nombre/descripción). Backspace edita; Esc limpia el filtro o vuelve un nivel. El chrome muestra `Filtro: …`
6. En menús de acción (sin filtro): Esc / `q` vuelve un nivel

Las tools `comingSoon` no ofrecen abrir ni instalar. Los comandos de install son strings estáticos del catálogo (nunca se evalúa input remoto).

Sin TTY, con `--json`, `--list` o `--no-interactive`, solo lista el catálogo (incluye metadata de `install`) — **nunca** corre installs ni cuelga. Podés saltar a una sección con su `id`:

```bash
alquimia tools
alquimia tools agents
alquimia tools harnesses
alquimia tools skills
alquimia tools --list
alquimia tools --json
alquimia tools testing --list
alquimia tools --no-banner
alquimia tools --yes   # saltea confirmación de install (TTY)
```

El catálogo vive en `src/tools.js` (fácil de ampliar). Los `install` son best-effort (p. ej. `brew` en macOS); la nota de cada tool aclara supuestos y alternativas.

### doctor

Diagnóstico del entorno (siempre exit 0 salvo error duro al leer archivos). Soporta `--json`:

```bash
alquimia doctor
alquimia doctor --json
```

Incluye: versión de Node / alquimia, path del binario, soft-check de installs duplicados (Homebrew vs nvm), terminal detectada y si `art` aplica, prefs de art (`~/.local/share/alquimia/art-prefs.json`), config Ghostty + bloque `# BEGIN alquimia-art`, y estado del auto-update (`--no-update` / `ALQUIMIA_NO_UPDATE` + hint del cache).

### completion

Scripts de completion (zsh / bash / fish) sin deps. Imprimí a stdout e instalá/eval:

```bash
# zsh (ejemplo)
alquimia completion zsh > ~/.zsh/completions/_alquimia

# bash
alquimia completion bash > ~/.local/share/bash-completion/completions/alquimia

# fish
alquimia completion fish > ~/.config/fish/completions/alquimia.fish

# o en la sesión actual
eval "$(alquimia completion zsh)"
```

Completa comandos y flags principales (`art`, `tools`, `doctor`, `--opacity`, `--fit`, `--clear`, `--json`, `--no-update`, …).

### dino

Alquimia Runner: un endless runner original en la TTY (sprites Unicode propios — no es el dino de Chrome). HUD con score + hi-score persistido en `~/.local/share/alquimia/dino-hiscore.json`.

```bash
alquimia dino
```

Controles: **Espacio** / **↑** saltá, **q** / **Esc** salí. Al game over muestra panel con score / récord; **Enter** reinicia.

También corre en paralelo durante installs largos de `tools` y durante `alquimia update` cuando hay TTY interactiva (se saltea con `--no-interactive`, `CI=true` o `ALQUIMIA_NO_DINO=1`).

### version

```bash
alquimia -v
alquimia --version
alquimia version
```

### update

Reinstalá la CLI desde GitHub en primer plano (también corre sola en segundo plano al arrancar; ver Auto-update arriba). En TTY interactiva, mientras corre el install podés jugar al Alquimia Runner:

```bash
alquimia update
```

## Development

```bash
git clone https://github.com/Alquimia-Hub/alquimia-cli.git
cd alquimia-cli
node bin/alquimia.js info
node bin/alquimia.js open discord
node bin/alquimia.js join --json
node bin/alquimia.js events --list
node bin/alquimia.js events --json
node bin/alquimia.js tools --list
node bin/alquimia.js tools --json
node bin/alquimia.js tools agents --list
node bin/alquimia.js tools harnesses --list
node bin/alquimia.js tools skills --list
node bin/alquimia.js tools design --list
node bin/alquimia.js info --json
node scripts/postinstall.js
```

### Testing

```bash
npm test          # vitest run (unit + fake-TTY picker + CLI smoke)
npm run test:watch
```

Cubre `visualLineCount` / anchos (bordes, ANSI, wide glyphs), regresión de stacking del picker (`select` con stdin/stdout fake: wrap, cancel, custom hint), helpers de agenda en `community.js` (reloj inyectado), helpers de auto-update (semver + cache, sin red) y smoke ampliado de `version` / `help` / `tools` / `events` / `info` / `join` (positivos, negativos y bordes).

Links, menú de `join` y agenda de `events` viven centralizados en `src/community.js` (incl. URLs de scheduled events de Discord). El catálogo de `tools` está en `src/tools.js`. El selector con flechas (`events` y `tools`) está en `src/select.js` (reutilizable). La lista de comandos + blurbs (help, `info`, postinstall y este README) está en `src/commands.js`. El auto-update silencioso está en `src/update.js`. El Alquimia Runner está en `src/dino/game.js`. El banner ASCII está en `src/banner.js`. El entrypoint es `bin/alquimia.js` (con shebang `#!/usr/bin/env node` para bins globales en Unix).

ESM (`"type": "module"`), sin dependencias de runtime (Vitest solo en dev), licencia MIT.

## Changelog

- **0.5.18** — Alquimia Runner UI polish: sprites Unicode multi-fila, campo más alto, colores ANSI (respeta `NO_COLOR`), HUD con hi-score (`~/.local/share/alquimia/dino-hiscore.json`), suelo continuo, panel de game over. Sin deps nuevas.
- **0.5.17** — `alquimia dino`: Alquimia Runner TTY original (Espacio/↑, q/Esc, Enter reinicia). Durante `tools` install y `update` en TTY interactiva corre en paralelo; se saltea con `--no-interactive` / CI / `ALQUIMIA_NO_DINO`. Helpers puros + Vitest. Sin deps nuevas.
- **0.5.15** — Help global más corto: tagline + Uso + Comandos (sin bloques Opciones / redes / secciones de tools / Auto-update). Flags y features siguen igual; tip de per-command help no se agregó (aún no hay `alquimia <cmd> --help`). Sin deps nuevas.
- **0.5.14** — `alquimia doctor` (diagnóstico + `--json`). `art --opacity` / `--fit` con prefs en `~/.local/share/alquimia/art-prefs.json` (`--clear` mantiene prefs; re-aplicar reescribe el bloque Ghostty). Completions zsh/bash/fish vía `alquimia completion <shell>`. Filtro type-to-search en el picker de `tools`. Sin deps nuevas.
- **0.5.13** — Ghostty `alquimia art`: `background-image-fit = cover` (llena la terminal; puede recortar bordes) + opacity default **0.28** (texto legible en dark mode). Re-aplicar `alquimia art` reescribe cover+0.28 (no deja `contain`/0.55 viejos). WezTerm: `config.background` `Cover` + brightness `0.18`. Contour/WT opacity `0.2`; Hyper scrim `0.72`; Tabby CSS opacity `0.2`. Si alguna versión de Ghostty letterboxea con `cover`, podés probar `background-image-fit = stretch` a mano. Sin deps nuevas.
- **0.5.12** — Ghostty `alquimia art`: auto-reload tras escribir/limpiar config (`SIGUSR2` / macOS ⌘⇧,). `--clear` **siempre** manda reload (aunque no haya bloque en el archivo) y limpia `background-image` huérfano hacia `~/.local/share/alquimia/art.png`. Opacity default `0.55`. **Terminal.app**: soporte por perfil `Alquimia` (bookmark via Swift + switch AppleScript; puede pedir Automatización/Accesibilidad). Tests mockeados; sin deps nuevas.
- **0.5.11** — `alquimia art`: multi-terminal (iTerm2, Kitty, Ghostty, WezTerm, Contour, Tilix, Terminology, Hyper, Tabby, Windows Terminal). Ghostty: bloque `# BEGIN/END alquimia-art` con keys 1.2+ (`background-image`, opacity 0.35, position/fit/repeat); paths App Support + XDG + `GHOSTTY_CONFIG_PATH`; reload requerido (no OSC). Art en `~/.local/share/alquimia/art.png`. Honest UX donde no hay API. Tests con temp HOME.
- **0.5.10** — Tests: cobertura Vitest ampliada (positivos / negativos / bordes) para `select`, smoke CLI y helpers de `community.js`.
- **0.5.9** — Auto-update silencioso al arrancar (check cacheado ~1h → cleanup global + `npm install -g` detachado). Evita `ENOTEMPTY` en Mac borrando `alquimia` / `.alquimia-*` bajo `npm root -g`. Flags/env: `--no-update`, `ALQUIMIA_NO_UPDATE`, skip en CI / sin TTY. Comando explícito `alquimia update`. Tests unitarios sin red.
- **0.5.8** — `alquimia art`: fondo de terminal con brand art (iTerm2 / Kitty) + `--clear` / `--open` / `--path`.
- **0.5.7** — Help: se quitó el bloque `Ejemplos` de la salida de ayuda. Fix: URLs de Discord scheduled-event de lunes y miércoles estaban intercambiadas.
- **0.5.5** — Fix: redraw portable del picker (`select`) sin DECSC/DECRC; limpia por conteo visual de filas (ancho de glifos + CSI/OSC) para que ↑↓ no apile menús en VS Code / Cursor. Suite Vitest (unit + fake-TTY stacking + CLI smoke).
- **0.5.4** — Fix: el picker interactivo (`select`) limpia filas visuales (wrap + ANSI) al navegar ↑↓, sin filas fantasma. Se quitó el placeholder `by the way tests` del catálogo de testing (queda Vitest).

## License

MIT © Alquimia Hub


## Brand art

Setear el fondo desde la CLI **no es universal**. `alquimia art` detecta la terminal y usa un mecanismo real (o dice que no puede).

| Terminal | OS | Método | ¿Reload? |
|---|---|---|---|
| **iTerm2** | macOS | OSC 1337 `SetBackgroundImageFile` | No (live) |
| **Kitty** | macOS/Linux | `kitty @ set-background-image` | No (remote control) |
| **Ghostty** | macOS/Linux | Config write (`background-image` + opacity **0.28** / `fit=cover` / position/repeat), bloque `# BEGIN/END alquimia-art` — **no OSC**; auto-reload vía **SIGUSR2** (Ghostty 1.2+) y fallback macOS ⌘⇧, (AppleScript; puede pedir Accesibilidad). `--clear` siempre recarga aunque el archivo ya esté limpio. Si `cover` letterboxea en tu Ghostty, probá `stretch` a mano en el bloque | Auto cuando se puede; si no, menú o ⌘⇧, / Ctrl+Shift+, |
| **Terminal.app** | macOS | Perfil `Alquimia` con `BackgroundImageBookmark` (helper Swift) + AppleScript `current settings` → perfil; `--clear` vuelve al perfil previo (state en `~/.local/share/alquimia/`). **No OSC**; puede pedir Automatización/Accesibilidad la 1ª vez | Switch de perfil (live) |
| **WezTerm** | macOS/Linux | `~/.wezterm.lua` `config.background` con `Cover` (+ hsb) | Auto / Ctrl+Shift+R |
| **Contour** | macOS/Linux | `contour.yml` `color_schemes.default.background_image` | Reiniciar ventana |
| **Tilix** | Linux | `gsettings` `com.gexperts.Tilix.Settings background-image` | No (puede pedir transparencia en el profile) |
| **Terminology** | Linux | `tybg` | No |
| **Hyper** | macOS/Linux | `.hyper.js` CSS (`background: … center / cover`) | Auto / reiniciar |
| **Tabby** | macOS/Linux | `config.yaml` `appearance.css` (`background-size: cover`) | Reiniciar / Acrylic on |
| **Windows Terminal** | Windows / WSL | `settings.json` `profiles.defaults.backgroundImage` + `uniformToFill` | Guardar settings / nueva pestaña |

**Sin soporte real (mensaje honesto + `--open`):** Alacritty (no hay wallpaper nativo), VS Code/Cursor integrated, GNOME Terminal/Ptyxis, Konsole (wallpaper vive en el color scheme; no lo tocamos), xterm/st/foot, tmux/screen solos.

**Terminal.app (honesto):** no hay API OSC de fondo; el soporte es **por perfil**. Si falla el bookmark/Swift, `alquimia art --open` + Ajustes → Perfiles → Fondo. La 1ª automatización puede pedir permiso.

El PNG se copia a `~/.local/share/alquimia/art.png` para que paths en configs sobrevivan un `npm -g` update.

```bash
alquimia art                    # set fondo (usa prefs guardadas o defaults)
alquimia art --opacity 0.28     # 0..1 (también --opacity=0.28); se guarda
alquimia art --fit cover        # cover|contain|stretch; se guarda
alquimia art --clear            # saca el fondo; **mantiene** prefs
alquimia art --open             # abrir el PNG
alquimia art --path             # imprimir ruta del asset bundledo
```

Prefs: `~/.local/share/alquimia/art-prefs.json` (defaults: opacity `0.28`, fit `cover`). Ghostty managed block uses those values (`position = center`, `repeat = false`). Re-run `alquimia art` to rewrite the block with current prefs. WezTerm/WT/Hyper/Tabby mapean `fit` cuando aplica.
