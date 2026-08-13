import type {
  Community,
  CommunityEvent,
  JoinOption,
  LinkKey,
  NextCall,
} from "./types.ts";

const discord = {
  invite: "https://discord.gg/wkhHrWZC3Q",
  guildId: "1470486817500303546",
  // Prefer a deep link to the eventos text channel when known:
  eventsChannelUrl: "https://discord.com/channels/1470486817500303546", // placeholder until channel id known
};

const links = {
  web: "https://alquimia.community/",
  github: "https://github.com/Alquimia-Hub",
  twitter: "https://x.com/alquimia_hub",
  discord: discord.invite,
  whatsapp: "https://chat.whatsapp.com/BhC5waw0nm1FIRSb9Kvs7a",
};

export const community: Community = {
  name: "Alquimia",
  tagline: "Comunidad abierta sobre IA, automatización y productividad",
  description:
    "Una comunidad abierta y gratuita donde compartimos conocimiento sobre inteligencia artificial, automatización y productividad.",
  links,
  discord,
  events: [
    {
      id: "community-call-monday",
      name: "Community Call",
      weekday: "lunes",
      time: "17:00",
      timezone: "America/Argentina/Buenos_Aires",
      place: "Discord",
      // Discord scheduled-event deep link (opens that event in the client).
      url: "https://discord.com/events/1470486817500303546/1535005054405185598/1539000867225600000",
      discordEventUrl:
        "https://discord.com/events/1470486817500303546/1535005054405185598/1539000867225600000",
    },
    {
      id: "community-call-wednesday",
      name: "Community Call",
      weekday: "miércoles",
      time: "17:00",
      timezone: "America/Argentina/Buenos_Aires",
      place: "Discord",
      url: "https://discord.com/events/1470486817500303546/1506675889658921081/1537188927897600000",
      discordEventUrl:
        "https://discord.com/events/1470486817500303546/1506675889658921081/1537188927897600000",
    },
  ],
  scheduleNote:
    "El horario puede moverse: chequeá #anuncios en Discord por si hay cambios.",
};

/**
 * URL to open for an event: per-event scheduled URL → events channel → invite.
 * @param {object} [event]
 * @returns {string}
 */
export function resolveEventUrl(
  event?: Partial<Pick<CommunityEvent, "url" | "discordEventUrl">> | null,
): string {
  if (event?.discordEventUrl) return event.discordEventUrl;
  if (event?.url) return event.url;
  if (community.discord?.eventsChannelUrl) {
    return community.discord.eventsChannelUrl;
  }
  return community.discord?.invite ?? community.links.discord;
}

/** Display labels for each link key (info output). */
export const linkLabels: Record<LinkKey, string> = {
  web: "Web",
  github: "GitHub",
  twitter: "Twitter/X",
  discord: "Discord",
  whatsapp: "WhatsApp",
};

/** Order used when printing links (info). */
export const linkOrder: LinkKey[] = [
  "web",
  "github",
  "twitter",
  "discord",
  "whatsapp",
];

/**
 * Join menu: Discord first (calls + channels), then lighter / other options.
 * Keys match `community.links`.
 */
export const joinOptions: JoinOption[] = [
  {
    key: "discord",
    blurb: "Recomendado — calls, canales y la charla del día a día",
  },
  {
    key: "whatsapp",
    blurb: "Opción más liviana — avisos y comunidad en el celu",
  },
  {
    key: "twitter",
    blurb: "Novedades y contenido en X / Twitter",
  },
  {
    key: "github",
    blurb: "Repos, issues y proyectos abiertos",
  },
  {
    key: "web",
    blurb: "Sitio de la comunidad",
  },
];

/**
 * Aliases for `alquimia open <red>` / `alquimia join <red>`.
 * Canonical keys match `community.links`.
 */
export const linkAliases: Record<string, LinkKey> = {
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

export function resolveLinkKey(name?: string | null): LinkKey | null {
  if (!name) return null;
  return linkAliases[name.toLowerCase()] ?? null;
}

/** Spanish weekday → JS getDay() (0 = domingo). */
const WEEKDAY_TO_JS: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  miércoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  sábado: 6,
};

/**
 * Wall-clock parts for a Date in a given IANA timezone (zero deps via Intl).
 * @returns {{ year: number, month: number, day: number, hour: number, minute: number, second: number, weekday: number }}
 */
export interface TzParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
}

export function getTzParts(date: Date, timeZone: string): TzParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const map = Object.fromEntries(
    parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value])
  );

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: weekdayMap[map.weekday],
  };
}

/**
 * Offset (ms) of `timeZone` relative to UTC at the given instant.
 * Positive means the zone is ahead of UTC (e.g. ARG ≈ +3h → +10800000).
 */
function tzOffsetMs(date: Date, timeZone: string): number {
  const p = getTzParts(date, timeZone);
  const asUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second
  );
  return asUtc - date.getTime();
}

/**
 * Instant when the local wall time in `timeZone` is year-month-day hour:minute.
 */
function zonedLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  // Guess: treat local as UTC, then correct by the zone offset at that instant.
  let utc = Date.UTC(year, month - 1, day, hour, minute, 0);
  utc -= tzOffsetMs(new Date(utc), timeZone);
  // Second pass if near a DST fold (Argentina is fixed UTC-3, but keep it robust).
  utc = Date.UTC(year, month - 1, day, hour, minute, 0) - tzOffsetMs(new Date(utc), timeZone);
  return new Date(utc);
}

/**
 * Next occurrence of a recurring weekly event at or after `now`.
 * @returns {Date}
 */
export function nextEventOccurrence(
  event: Pick<CommunityEvent, "weekday" | "time" | "timezone">,
  now: Date = new Date(),
): Date {
  const targetWeekday = WEEKDAY_TO_JS[event.weekday.toLowerCase()];
  if (targetWeekday === undefined) {
    throw new Error(`Weekday desconocido: ${event.weekday}`);
  }

  const [hh, mm] = event.time.split(":").map(Number);
  const tz = event.timezone;
  const local = getTzParts(now, tz);

  let daysAhead = (targetWeekday - local.weekday + 7) % 7;
  let year = local.year;
  let month = local.month;
  let day = local.day + daysAhead;

  // Roll calendar day (simple: use Date.UTC midnight dance).
  const rolled = new Date(Date.UTC(year, month - 1, day));
  year = rolled.getUTCFullYear();
  month = rolled.getUTCMonth() + 1;
  day = rolled.getUTCDate();

  let occurrence = zonedLocalToUtc(year, month, day, hh, mm, tz);

  // If it's today but the time already passed, jump one week.
  // Exact match (call starting now) still counts as the next/current call.
  if (occurrence.getTime() < now.getTime()) {
    const next = new Date(Date.UTC(year, month - 1, day + 7));
    occurrence = zonedLocalToUtc(
      next.getUTCFullYear(),
      next.getUTCMonth() + 1,
      next.getUTCDate(),
      hh,
      mm,
      tz
    );
  }

  return occurrence;
}

/**
 * Among community.events, the soonest upcoming call.
 * @returns {{ event: object, at: Date } | null}
 */
export function getNextCommunityCall(now: Date = new Date()): NextCall | null {
  const events = community.events ?? [];
  if (events.length === 0) return null;

  let best: NextCall | null = null;
  for (const event of events) {
    const at = nextEventOccurrence(event, now);
    if (!best || at.getTime() < best.at.getTime()) {
      best = { event, at };
    }
  }
  return best;
}
