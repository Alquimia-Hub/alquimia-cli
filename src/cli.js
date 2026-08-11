import { community } from "./community.js";

const HELP = `alquimia — CLI de la comunidad Alquimia 🧪

Uso:
  alquimia <comando>

Comandos:
  info    Descripción y redes de la comunidad
  help    Mostrar esta ayuda
  version Mostrar versión
`;

function printInfo() {
  const { name, tagline, description, links } = community;
  console.log(
    [
      "",
      `🧪 ${name}`,
      tagline,
      "",
      description,
      "",
      "Redes",
      `  Web       ${links.web}`,
      `  GitHub    ${links.github}`,
      `  Twitter   ${links.twitter}`,
      `  Discord   ${links.discord}`,
      `  WhatsApp  ${links.whatsapp}`,
      "",
    ].join("\n")
  );
}

export function run(args) {
  const [cmd] = args;

  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    console.log(HELP);
    return;
  }

  if (cmd === "version" || cmd === "--version" || cmd === "-v") {
    console.log("0.1.0");
    return;
  }

  if (cmd === "info") {
    printInfo();
    return;
  }

  console.error(`Comando desconocido: ${cmd}\n`);
  console.log(HELP);
  process.exitCode = 1;
}
