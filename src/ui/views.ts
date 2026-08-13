/**
 * Document builders — one function per screen.
 *
 * These return blocks from `src/ui/doc.js` and know nothing about renderers,
 * which is what lets the same view serve a styled terminal and a pipe.
 */

import { commandRows } from "../commands.ts";
import {
  community,
  getNextCommunityCall,
  joinOptions,
  linkLabels,
  linkOrder,
} from "../community.ts";
import { normalizeInstall, toolHasInstall, toolSections } from "../tools.ts";
import { banner, blank, heading, item, kv, text, type Block, type Span } from "./doc.ts";
import type { PickerOption } from "./picker.ts";
import type {
  CommunityEvent,
  LinkKey,
  NextCall,
  Tool,
  ToolSection,
} from "../types.ts";

export function formatEventWhen(event: CommunityEvent): string {
  const day = event.weekday.charAt(0).toUpperCase() + event.weekday.slice(1);
  return `${day} ${event.time} ARG (UTC-3)`;
}

export function helpView({ noBanner = false } = {}): Block[] {
  return [
    ...(noBanner ? [] : [banner(), blank()]),
    text(community.tagline, "muted"),
    blank(),
    heading("Uso"),
    text("  alquimia [comando] [opciones]", "muted"),
    blank(),
    heading("Comandos"),
    // Usage strings run long; a two-column layout would squeeze the blurbs to
    // a sliver on an 80-col terminal, so each command gets its own stanza.
    ...commandRows({ useUsage: true }).map((row) =>
      item({
        marker: "▸",
        markerTone: "brand",
        title: row.key,
        titleTone: "accent",
        lines: [{ text: row.value, tone: "muted" }],
      }),
    ),
    blank(),
  ];
}

export function infoView({ noBanner = false } = {}): Block[] {
  return [
    ...(noBanner ? [] : [banner(), blank()]),
    text(community.tagline, "accent"),
    blank(),
    text(community.description),
    blank(),
    heading("Redes"),
    kv(
      linkOrder.map((key) => ({
        key: linkLabels[key],
        value: community.links[key],
        keyTone: "good",
      })),
    ),
    blank(),
    heading("Comandos"),
    kv(commandRows()),
    blank(),
    text("Tip: alquimia help para más.", "faint"),
    blank(),
  ];
}

export function joinView({ noBanner = false } = {}): Block[] {
  return [
    ...(noBanner ? [] : [banner(), blank()]),
    heading("¿Por dónde te sumás?"),
    text(
      "Discord es lo más completo (calls + canales). WhatsApp es más liviano.",
      "muted",
    ),
    blank(),
    ...joinOptions.flatMap((opt, i) => [
      item({
        marker: `${i + 1}.`,
        markerTone: "accent",
        title: linkLabels[opt.key],
        lines: [
          { text: opt.blurb, tone: "muted" },
          { text: community.links[opt.key], tone: "faint" },
        ],
      }),
    ]),
    blank(),
  ];
}

export function eventsView({
  noBanner = false,
  next = getNextCommunityCall(),
}: { noBanner?: boolean; next?: NextCall | null } = {}): Block[] {
  return [
    ...(noBanner ? [] : [banner(), blank()]),
    heading("Community calls"),
    text("Recurrentes · voz en Discord · horario ARG (UTC-3)", "muted"),
    blank(),
    ...community.events.map((event) => {
      const isNext = Boolean(next && next.event.id === event.id);
      return item({
        marker: isNext ? "→" : " ",
        markerTone: "good",
        title: event.name,
        titleTone: isNext ? "good" : "default",
        tag: isNext ? "(próxima)" : undefined,
        lines: [
          { text: formatEventWhen(event), tone: isNext ? "accent" : "muted" },
          { text: `Dónde: ${event.place}`, tone: "faint" },
        ],
      });
    }),
    blank(),
    heading("Discord"),
    text(`  ${community.discord?.invite ?? community.links.discord}`, "faint"),
    blank(),
    ...(community.scheduleNote
      ? [text(community.scheduleNote, "muted"), blank()]
      : []),
  ];
}

export function toolsView({
  noBanner = false,
  section = null,
}: { noBanner?: boolean; section?: ToolSection | null } = {}): Block[] {
  const sections = section ? [section] : toolSections;

  return [
    ...(noBanner ? [] : [banner(), blank()]),
    heading("Catálogo de tools"),
    text("Recomendaciones de la comunidad · links + install (si hay)", "muted"),
    blank(),
    ...sections.flatMap((sec) => [
      heading(sec.name),
      text(`  ${sec.blurb}`, "muted"),
      text(`  id: ${sec.id}`, "accent"),
      blank(),
      ...sec.tools.map((tool) => {
        const soon = Boolean(tool.comingSoon || !tool.url);
        const install = normalizeInstall(tool);
        const lines: Span[] = [{ text: tool.blurb, tone: "muted" }];
        if (tool.url) lines.push({ text: tool.url, tone: "faint" });
        if (install?.global) {
          lines.push({ text: `install global: ${install.global}`, tone: "faint" });
        }
        if (install?.project) {
          lines.push({ text: `install proyecto: ${install.project}`, tone: "faint" });
        }
        if (install?.note) {
          lines.push({ text: `nota: ${install.note}`, tone: "faint" });
        }
        return item({
          marker: "·",
          title: tool.name,
          tag: soon ? "(próximamente)" : undefined,
          lines,
        });
      }),
      blank(),
    ]),
    ...(section
      ? []
      : [
          text("Tip: alquimia tools <sección> para saltar a una categoría.", "faint"),
          blank(),
        ]),
  ];
}

/* ── Picker option builders ─────────────────────────────────────────── */

export function eventOptions(
  next: NextCall | null = getNextCommunityCall(),
): PickerOption<CommunityEvent>[] {
  return community.events.map((event) => {
    const isNext = Boolean(next && next.event.id === event.id);
    return {
      name: isNext ? `${event.name}  (próxima)` : event.name,
      description: formatEventWhen(event),
      value: event,
    };
  });
}

export function sectionOptions(): PickerOption<ToolSection>[] {
  return toolSections.map((section) => ({
    name: section.name,
    description: section.blurb,
    filterText: section.id,
    value: section,
  }));
}

export function toolOptions(section: ToolSection): PickerOption<Tool>[] {
  return (section.tools ?? []).map((tool) => {
    const soon = Boolean(tool.comingSoon || !tool.url);
    const tags = [soon ? "(próximamente)" : null, toolHasInstall(tool) ? "(install)" : null]
      .filter(Boolean)
      .join(" ");
    return {
      name: tags ? `${tool.name}  ${tags}` : tool.name,
      description: tool.blurb ?? "",
      filterText: `${tool.name} ${tool.blurb ?? ""} ${tool.id ?? ""}`,
      value: tool,
    };
  });
}

/**
 * Home menu shown when `alquimia` runs with no command on a TTY.
 *
 * Only commands that do something useful without arguments are listed —
 * `open <red>` and `completion <shell>` need one, so they stay CLI-only.
 */
export function homeOptions(): PickerOption<string>[] {
  // Short one-liners on purpose: the full blurbs from `commands.json` wrap to
  // three rows in a launcher and turn the menu into a wall of text.
  return [
    { name: "info", description: "Qué es Alquimia y sus redes" },
    { name: "join", description: "Sumate: Discord, WhatsApp, X, GitHub" },
    { name: "events", description: "Community calls · lun/mié 17:00 ARG" },
    { name: "tools", description: "Catálogo de tools · abrir docs o instalar" },
    { name: "dino", description: "Alquimia Runner · el juego" },
    { name: "art", description: "Fondo de terminal con brand art" },
    { name: "doctor", description: "Diagnóstico del entorno" },
    { name: "update", description: "Actualizar la CLI ahora" },
    { name: "help", description: "Ayuda completa" },
    { name: "salir", description: "Cerrar Alquimia" },
  ].map((o) => ({ ...o, filterText: o.name, value: o.name }));
}

export function joinOptionsForPicker(): PickerOption<LinkKey>[] {
  return joinOptions.map((opt) => ({
    name: linkLabels[opt.key],
    description: opt.blurb,
    filterText: opt.key,
    value: opt.key,
  }));
}
