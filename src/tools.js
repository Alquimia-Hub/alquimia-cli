/**
 * Nested catalog for `alquimia tools`.
 * Sections → tools; fill / expand over time. Zero runtime deps.
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
      },
      {
        id: "fzf",
        name: "fzf",
        blurb:
          "Fuzzy finder para buscar archivos, historial y más a toda velocidad",
        url: "https://github.com/junegunn/fzf",
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
          "ADE para correr varios agents en paralelo, cada uno en su worktree",
        url: "https://www.onorca.dev",
      },
      {
        id: "omo",
        name: "Oh My OpenAgent (OMO)",
        blurb:
          "Harness multi-agent para OpenCode: orquesta specialists en paralelo (omo.dev)",
        url: "https://github.com/code-yeongyu/oh-my-openagent",
      },
      {
        id: "gentle-ai",
        name: "Gentle-AI",
        blurb:
          "Configurador de ecosistema para coding agents: memoria, SDD, skills y review",
        url: "https://github.com/Gentleman-Programming/gentle-ai",
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
        blurb: "Vibe design local: tu coding agent como motor de diseño",
        url: "https://open-design.ai",
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
      },
      {
        id: "bythewaytests",
        name: "by the way tests",
        blurb: "Recomendación de la comunidad — link pronto",
        url: null,
        comingSoon: true,
      },
    ],
  },
];

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
 * Machine-readable catalog tree (sections + tools).
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
