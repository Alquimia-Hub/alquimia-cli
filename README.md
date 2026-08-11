# alquimia

CLI de la comunidad [Alquimia](https://alquimia.community/) — IA, automatización y productividad.

## Install

Desde el home actual del repo:

```bash
npm install -g github:Nicolopez603/alquimia-cli
```

Requiere **Node.js 18+**.

Después del install vas a ver un tip con los comandos. Resumen (fuente: `src/commands.js`):

```
Comandos
  info     Qué es Alquimia, la descripción de la comunidad y links a web, GitHub, X, Discord y WhatsApp
  join     Menú para sumarte; abrí Discord (recomendado), WhatsApp, X, GitHub o la web
  events   Calls de lun/mié 17:00 ARG; en TTY elegí con ↑↓ y Enter abre el evento en Discord
  tools    Catálogo de tools; en TTY: sección → tool → acción (abrir docs o instalar). Esc/q vuelve un nivel
  open     Abrí una red puntual en el navegador (`open discord`, `open x`, etc.)
  help     Ayuda completa con opciones, alias y ejemplos
  version  Versión instalada de la CLI
```

Empezá con `alquimia info` o `alquimia help`.

## Usage

Sin argumentos (o con `-h` / `--help`) muestra la ayuda, con un banner ASCII (wordmark + triángulo) arriba:

```bash
alquimia
alquimia --help
```

Usá `--no-banner` en `help` / `info` / `join` / `events` / `tools` si preferís omitirlo.

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

Catálogo anidado de herramientas recomendadas por la comunidad (terminal, agents, harnesses, diseño, testing).

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
node bin/alquimia.js info --json
node scripts/postinstall.js
```

Links, menú de `join` y agenda de `events` viven centralizados en `src/community.js` (incl. URLs de scheduled events de Discord). El catálogo de `tools` está en `src/tools.js`. El selector con flechas (`events` y `tools`) está en `src/select.js` (reutilizable). La lista de comandos + blurbs (help, `info`, postinstall y este README) está en `src/commands.js`. El banner ASCII está en `src/banner.js`. El entrypoint es `bin/alquimia.js` (con shebang `#!/usr/bin/env node` para bins globales en Unix).

ESM (`"type": "module"`), sin dependencias de runtime, licencia MIT.

## License

MIT © Alquimia Hub
