/**
 * Nested catalog for `alquimia tools`.
 * Sections → tools; fill / expand over time. Zero runtime deps.
 *
 * Optional `install` on a tool:
 *   {
 *     global: 'brew install gh',  // or null
 *     project: 'npm i -D vitest', // or null
 *     note: 'Tip shown before running',
 *   }
 * Commands are static catalog strings only (never remote eval).
 */

export const toolSections = [
  {
    id: "terminal",
    name: "Herramientas de terminal",
    blurb: "CLIs y utils del día a día en la terminal",
    tools: [
      {
        id: "gh",
        name: "gh",
        blurb: "GitHub desde la terminal: PRs, issues y repos",
        url: "https://cli.github.com",
        install: {
          global: "brew install gh",
          project: null,
          note: "macOS/Homebrew. En Linux: mirá las docs (apt/dnf/etc.).",
        },
      },
      {
        id: "fzf",
        name: "fzf",
        blurb:
          "Fuzzy finder para buscar archivos, historial y más a toda velocidad",
        url: "https://github.com/junegunn/fzf",
        install: {
          global: "brew install fzf",
          project: null,
          note: "macOS/Homebrew. En Linux: mirá las docs del repo.",
        },
      },
      {
        id: "npkill",
        name: "npkill",
        blurb: "Encontrá y borrá node_modules pesados",
        url: "https://npkill.js.org/",
        install: {
          global: "npm i -g npkill",
          project: null,
          note: "También: npx npkill (sin install global).",
        },
      },
    ],
  },
  {
    id: "agents",
    name: "Herramientas de agentes",
    blurb: "Coding agents para el día a día",
    tools: [
      {
        id: "opencode",
        name: "OpenCode",
        blurb: "Coding agent open source que corre en la terminal",
        url: "https://opencode.ai",
        install: {
          global: "npm i -g opencode-ai@latest",
          project: null,
          note: "También: brew install anomalyco/tap/opencode (macOS/Linux).",
        },
      },
    ],
  },
  {
    id: "harnesses",
    name: "Harnesses / managers",
    blurb: "Managers, configuradores y orquestación de agents",
    tools: [
      {
        id: "orca",
        name: "Orca",
        blurb:
          "ADE para correr varios agents en paralelo, cada uno en su worktree (app de escritorio — abrí el sitio para instalar)",
        url: "https://www.onorca.dev",
      },
      {
        id: "omo",
        name: "Oh My OpenAgent (OMO)",
        blurb:
          "Harness multi-agent para OpenCode: orquesta specialists en paralelo (omo.dev)",
        url: "https://github.com/code-yeongyu/oh-my-openagent",
        install: {
          global: "bunx oh-my-openagent install",
          project: null,
          note: "Requiere Bun + OpenCode. Alternativa Codex: npx lazycodex-ai install. Si algo falla, seguí la guía del repo.",
        },
      },
      {
        id: "gentle-ai",
        name: "Gentle-AI",
        blurb:
          "Configurador de ecosistema para coding agents: memoria, SDD, skills y review",
        url: "https://github.com/Gentleman-Programming/gentle-ai",
        install: {
          global:
            "curl -fsSL https://raw.githubusercontent.com/Gentleman-Programming/gentle-ai/main/scripts/install.sh | bash",
          project: null,
          note: "Installer oficial. Alternativa: go install github.com/gentleman-programming/gentle-ai/v2/cmd/gentle-ai@latest",
        },
      },
      {
        id: "codexbar",
        name: "CodexBar",
        blurb:
          "Menu bar macOS: límites de Codex y coding agents, con countdown al reset",
        url: "https://github.com/steipete/CodexBar",
        install: {
          global: "brew install --cask codexbar",
          project: null,
          note: "macOS 14+. Alternativa: descargá el release desde GitHub o mirá https://codexbar.app",
        },
      },
    ],
  },
  {
    id: "skills",
    name: "Skills",
    blurb: "Skills y MCPs que le suman contexto/poder a tus agents",
    tools: [
      {
        id: "context7",
        name: "Context7",
        blurb:
          "Docs al día para LLMs: mete referencias de librerías en el contexto del agent (MCP)",
        url: "https://github.com/upstash/context7",
        install: {
          global: "npx ctx7 setup",
          project: null,
          note: "Setup oficial (CLI + skill o MCP). Alternativa manual: agregá el MCP en Cursor/OpenCode — docs en el repo.",
        },
      },
      {
        id: "codegraph",
        name: "Code Graph",
        blurb:
          "Grafo de código local para agents: menos grep, más contexto preciso (MCP)",
        url: "https://github.com/colbymchenry/codegraph",
        install: {
          global: "npm i -g @colbymchenry/codegraph",
          project: null,
          note: "Después: codegraph install (wire MCP) y codegraph init por proyecto. Atajo: npx @colbymchenry/codegraph",
        },
      },
      {
        id: "fff",
        name: "FFF",
        blurb:
          "File search SDK ultra rápido/preciso para AI agents, Neovim, Rust, Node, etc.",
        url: "https://github.com/dmtrKovalenko/fff",
        install: {
          global: "brew install dmtrKovalenko/fff/fff-mcp",
          project: null,
          note: "macOS/Linux via Homebrew. También: curl -L https://dmtrkovalenko.dev/install-fff-mcp.sh | bash — después registrá el MCP en tu agent.",
        },
      },
      {
        id: "mattpocock-skills",
        name: "Matt Pocock Skills",
        blurb:
          "Skill system para engineers: grill → spec → tickets → implement → review (AIHero)",
        url: "https://github.com/mattpocock/skills",
        install: {
          project: "npx skills@latest add mattpocock/skills",
          global: null,
          note: "Escribe skills editables en el proyecto. Site: https://www.aihero.dev/skills · Update: npx skills update. Claude Code plugin: claude plugins install mattpocock-skills",
        },
      },
      {
        id: "system_prompts_leaks",
        name: "system_prompts_leaks",
        blurb:
          "Colección de system prompts de agents/productos (referencia)",
        url: "https://github.com/asgeirtj/system_prompts_leaks",
      },
    ],
  },
  {
    id: "design",
    name: "Herramientas de diseño",
    blurb: "Diseño, UI y creativo",
    tools: [
      {
        id: "opendesign",
        name: "Open Design",
        blurb:
          "Vibe design local: tu coding agent como motor de diseño (desktop/app — seguí la guía del sitio)",
        url: "https://open-design.ai",
      },
      {
        id: "uideck",
        name: "UIDeck",
        blurb: "Templates y UI kits gratis/premium para landing y apps",
        url: "https://uideck.com/",
      },
      {
        id: "kokonutui",
        name: "KokonutUI",
        blurb: "Componentes UI open source listos para copiar",
        url: "https://github.com/kokonut-labs/kokonutui",
      },
    ],
  },
  {
    id: "testing",
    name: "Unit tests / testing",
    blurb: "Testing y calidad",
    tools: [
      {
        id: "vitest",
        name: "Vitest",
        blurb: "Runner de tests rápido para JS/TS",
        url: "https://vitest.dev",
        install: {
          global: "npm i -g vitest",
          project: "npm i -D vitest",
          note: "En un proyecto, preferí la install local (devDependency).",
        },
      },
    ],
  },
];

/**
 * Normalize install block for catalog / JSON.
 * @param {{ install?: { global?: string|null, project?: string|null, note?: string|null } | null }} tool
 * @returns {{ global: string|null, project: string|null, note: string|null } | null}
 */
export function normalizeInstall(tool) {
  const install = tool?.install;
  if (!install || typeof install !== "object") return null;
  const global =
    typeof install.global === "string" && install.global.trim()
      ? install.global.trim()
      : null;
  const project =
    typeof install.project === "string" && install.project.trim()
      ? install.project.trim()
      : null;
  const note =
    typeof install.note === "string" && install.note.trim()
      ? install.note.trim()
      : null;
  if (!global && !project && !note) return null;
  return { global, project, note };
}

/**
 * Whether the tool has at least one runnable install command.
 * @param {{ install?: object|null, comingSoon?: boolean }} tool
 */
export function toolHasInstall(tool) {
  if (tool?.comingSoon) return false;
  const install = normalizeInstall(tool);
  return Boolean(install?.global || install?.project);
}

/**
 * @param {string} id
 * @returns {typeof toolSections[number] | null}
 */
export function findToolSection(id) {
  if (!id) return null;
  const key = String(id).toLowerCase();
  return toolSections.find((s) => s.id === key) ?? null;
}

/**
 * Machine-readable catalog tree (sections + tools + install metadata).
 * @returns {object}
 */
export function toolsCatalogPayload() {
  return {
    sections: toolSections.map((section) => ({
      id: section.id,
      name: section.name,
      blurb: section.blurb,
      tools: section.tools.map((tool) => ({
        id: tool.id,
        name: tool.name,
        blurb: tool.blurb,
        url: tool.url ?? null,
        comingSoon: Boolean(tool.comingSoon || !tool.url),
        install: normalizeInstall(tool),
      })),
    })),
  };
}

/**
 * Whether a tool can be opened in the browser.
 * @param {{ url?: string|null, comingSoon?: boolean }} tool
 */
export function isToolOpenable(tool) {
  return Boolean(tool?.url) && !tool.comingSoon;
}
