export const community = {
  name: "Alquimia",
  tagline: "Comunidad abierta sobre IA y productividad",
  description:
    "Una comunidad abierta y gratuita donde compartimos conocimiento sobre inteligencia artificial, automatización y productividad.",
  links: {
    web: "https://alquimia.community/",
    github: "https://github.com/Alquimia-Hub",
    twitter: "https://x.com/alquimia_hub",
    discord: "https://discord.gg/wkhHrWZC3Q",
    whatsapp: "https://chat.whatsapp.com/BhC5waw0nm1FIRSb9Kvs7a",
  },
};

/** Display labels for each link key (info output). */
export const linkLabels = {
  web: "Web",
  github: "GitHub",
  twitter: "Twitter/X",
  discord: "Discord",
  whatsapp: "WhatsApp",
};

/** Order used when printing links. */
export const linkOrder = ["web", "github", "twitter", "discord", "whatsapp"];

/**
 * Aliases for `alquimia open <red>`.
 * Canonical keys match `community.links`.
 */
export const linkAliases = {
  web: "web",
  site: "web",
  github: "github",
  gh: "github",
  twitter: "twitter",
  x: "twitter",
  discord: "discord",
  whatsapp: "whatsapp",
  wa: "whatsapp",
};

export function resolveLinkKey(name) {
  if (!name) return null;
  return linkAliases[name.toLowerCase()] ?? null;
}
