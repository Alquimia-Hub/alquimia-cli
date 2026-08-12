# alquimia

CLI de la comunidad [Alquimia](https://alquimia.community/) — IA, automatización y productividad.

## Install

Desde el home actual del repo:

```bash
npm install -g github:Nicolopez603/alquimia-cli
```

Requiere **Node.js 18+**.

Si en Mac ves `ENOTEMPTY` al renombrar `/opt/homebrew/lib/node_modules/alquimia`, limpiá e instalá de nuevo:

```bash
rm -rf "$(npm root -g)/alquimia" "$(npm root -g)"/.alquimia-* && npm install -g github:Nicolopez603/alquimia-cli
```

(`alquimia update` y el auto-update hacen ese cleanup solos antes del `npm install -g`.)

Después del install vas a ver un tip con los comandos. Resumen (fuente: `src/commands.js`):

```
Comandos
  info     Qué es Alquimia, la descripción de la comunidad y links a web, GitHub, X, Discord y WhatsApp
  join     Menú para sumarte; abrí Discord (recomendado), WhatsApp, X, GitHub o la web
  events   Calls de lun/mié 17:00 ARG; en TTY elegí con ↑↓ y Enter abre el evento en Discord
  tools    Catálogo de tools; en TTY: sección → tool → acción (abrir docs o instalar). Esc/q vuelve un nivel
  open     Abrí una red puntual en el navegador (`open discord`, `open x`, etc.)
  art      Fondo de terminal con el brand art (iTerm2/Kitty); `--clear` / `clear` lo saca
  update   Actualizá la CLI ahora (también se auto-actualiza en segundo plano al arrancar)
  help     Ayuda completa con opciones y alias
  version  Versión instalada de la CLI
```

Empezá con `alquimia info` o `alquimia help`.

### Auto-update

Al arrancar en una terminal interactiva (TTY), `alquimia` chequea ~1 vez por hora si hay una versión más nueva en GitHub y, si hace falta, lanza `npm install -g github:Nicolopez603/alquimia-cli` en **segundo plano**. El comando actual sigue con la versión ya cargada; la próxima invocación usa la nueva.

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
5. Esc / `q` vuelve un nivel: acciones → tools → secciones → salir

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

### version

```bash
alquimia -v
alquimia --version
alquimia version
```

### update

Reinstalá la CLI desde GitHub en primer plano (también corre sola en segundo plano al arrancar; ver Auto-update arriba):

```bash
alquimia update
```

## Development

```bash
git clone https://github.com/Nicolopez603/alquimia-cli.git
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

Links, menú de `join` y agenda de `events` viven centralizados en `src/community.js` (incl. URLs de scheduled events de Discord). El catálogo de `tools` está en `src/tools.js`. El selector con flechas (`events` y `tools`) está en `src/select.js` (reutilizable). La lista de comandos + blurbs (help, `info`, postinstall y este README) está en `src/commands.js`. El auto-update silencioso está en `src/update.js`. El banner ASCII está en `src/banner.js`. El entrypoint es `bin/alquimia.js` (con shebang `#!/usr/bin/env node` para bins globales en Unix).

ESM (`"type": "module"`), sin dependencias de runtime (Vitest solo en dev), licencia MIT.

## Changelog

- **0.5.10** — Tests: cobertura Vitest ampliada (positivos / negativos / bordes) para `select`, smoke CLI y helpers de `community.js`.
- **0.5.9** — Auto-update silencioso al arrancar (check cacheado ~1h → cleanup global + `npm install -g` detachado). Evita `ENOTEMPTY` en Mac borrando `alquimia` / `.alquimia-*` bajo `npm root -g`. Flags/env: `--no-update`, `ALQUIMIA_NO_UPDATE`, skip en CI / sin TTY. Comando explícito `alquimia update`. Tests unitarios sin red.
- **0.5.8** — `alquimia art`: fondo de terminal con brand art (iTerm2 / Kitty) + `--clear` / `--open` / `--path`.
- **0.5.7** — Help: se quitó el bloque `Ejemplos` de la salida de ayuda. Fix: URLs de Discord scheduled-event de lunes y miércoles estaban intercambiadas.
- **0.5.5** — Fix: redraw portable del picker (`select`) sin DECSC/DECRC; limpia por conteo visual de filas (ancho de glifos + CSI/OSC) para que ↑↓ no apile menús en VS Code / Cursor. Suite Vitest (unit + fake-TTY stacking + CLI smoke).
- **0.5.4** — Fix: el picker interactivo (`select`) limpia filas visuales (wrap + ANSI) al navegar ↑↓, sin filas fantasma. Se quitó el placeholder `by the way tests` del catálogo de testing (queda Vitest).

## License

MIT © Alquimia Hub


## Brand art

```bash
alquimia art          # fondo en iTerm2 / Kitty
alquimia art --clear  # sacar fondo
alquimia art --open   # abrir el PNG
```
