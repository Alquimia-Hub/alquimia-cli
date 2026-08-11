# alquimia

CLI de la comunidad [Alquimia](https://alquimia.community/) — IA, automatización y productividad.

## Install

Desde el home actual del repo:

```bash
npm install -g github:Nicolopez603/alquimia-cli
```

Requiere **Node.js 18+**.

## Usage

Sin argumentos (o con `-h` / `--help`) muestra la ayuda:

```bash
alquimia
alquimia --help
```

### info

Descripción de la comunidad y links a las redes:

```bash
alquimia info
```

Salida machine-readable:

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
node bin/alquimia.js info --json
```

Los links viven centralizados en `src/community.js`. El entrypoint es `bin/alquimia.js` (con shebang `#!/usr/bin/env node` para bins globales en Unix).

ESM (`"type": "module"`), sin dependencias de runtime, licencia MIT.

## License

MIT © Alquimia Hub
