/**
 * Shared domain types.
 *
 * Data shapes that cross module boundaries live here so the catalog, the
 * views and the tests all agree on one definition.
 */

/* ── Community ──────────────────────────────────────────────────────── */

export type LinkKey = "web" | "github" | "twitter" | "discord" | "whatsapp";

export type CommunityLinks = Record<LinkKey, string>;

export interface DiscordInfo {
  invite: string;
  guildId: string;
  eventsChannelUrl: string | null;
}

export interface CommunityEvent {
  id: string;
  name: string;
  weekday: string;
  time: string;
  timezone: string;
  place: string;
  url?: string;
  discordEventUrl?: string;
}

export interface Community {
  name: string;
  tagline: string;
  description: string;
  links: CommunityLinks;
  discord: DiscordInfo;
  events: CommunityEvent[];
  scheduleNote: string;
}

export interface JoinOption {
  key: LinkKey;
  blurb: string;
}

export interface NextCall {
  event: CommunityEvent;
  at: Date;
}

/* ── Tools catalog ──────────────────────────────────────────────────── */

export interface ToolInstall {
  global: string | null;
  project: string | null;
  note?: string | null;
}

export interface Tool {
  id: string;
  name: string;
  blurb: string;
  url?: string | null;
  install?: ToolInstall | null;
  comingSoon?: boolean;
}

export interface ToolSection {
  id: string;
  name: string;
  blurb: string;
  tools: Tool[];
}

/* ── Commands ───────────────────────────────────────────────────────── */

export interface CommandSpec {
  name: string;
  usage: string;
  blurb: string;
}

/* ── Art ────────────────────────────────────────────────────────────── */

export type TerminalId =
  | "iterm2"
  | "kitty"
  | "ghostty"
  | "wezterm"
  | "contour"
  | "tilix"
  | "terminology"
  | "hyper"
  | "tabby"
  | "windows-terminal"
  | "alacritty"
  | "konsole"
  | "apple-terminal"
  | "vscode"
  | "gnome-terminal"
  | "unsupported";

export type ArtFit = "cover" | "contain" | "stretch";

export interface ArtPrefs {
  opacity: number;
  fit: ArtFit;
  path: string;
  fromDisk: boolean;
}

/**
 * Result shape shared by every `art` backend. Individual backends fill in
 * only the fields that make sense for their mechanism, which is why almost
 * everything past `ok` is optional.
 */
export interface ArtBackendResult {
  ok: boolean;
  configPath?: string | null;
  changed?: boolean;
  error?: string | null;
  tip?: string | null;
  reloaded?: boolean;
  needsReload?: boolean;
  reloadHint?: string | null;
  successMessage?: string | null;
  successExtra?: string | null;
  [key: string]: unknown;
}

/* ── Injectable filesystem helpers (used for tests) ──────────────────── */

export interface FsInject {
  existsSync?: (p: string) => boolean;
  readFileSync?: (p: string, enc: "utf8") => string;
  writeFileSync?: (p: string, data: string, enc: "utf8") => void;
  mkdirSync?: (p: string, opts?: { recursive?: boolean }) => unknown;
}
