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
  events   Community calls de lunes y miércoles 17:00 ARG, con cuál es la próxima
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

Usá `--no-banner` en `help` / `info` / `join` / `events` si preferís omitirlo.

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

Community calls recurrentes (lunes y miércoles 17:00 ARG / UTC-3, en Discord). Destaca la próxima call:

```bash
alquimia events
alquimia events --json
alquimia events --no-banner
```

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
node bin/alquimia.js events
node bin/alquimia.js events --json
node bin/alquimia.js info --json
node scripts/postinstall.js
```

Links, menú de `join` y agenda de `events` viven centralizados en `src/community.js`. La lista de comandos + blurbs (help, `info`, postinstall y este README) está en `src/commands.js`. El banner ASCII está en `src/banner.js`. El entrypoint es `bin/alquimia.js` (con shebang `#!/usr/bin/env node` para bins globales en Unix).

ESM (`"type": "module"`), sin dependencias de runtime, licencia MIT.

## License

MIT © Alquimia Hub
