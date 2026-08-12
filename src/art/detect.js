/**
 * Terminal ids returned by detectTerminal().
 * @typedef {'iterm2'|'kitty'|'ghostty'|'wezterm'|'contour'|'tilix'|'terminology'|'hyper'|'tabby'|'windows-terminal'|'alacritty'|'konsole'|'apple-terminal'|'vscode'|'gnome-terminal'|'unsupported'} TerminalId
 */

/**
 * Detect terminal family for background-image support.
 * Pure when `env` is passed.
 * Prefers outer GUI terminal signals over multiplexers (tmux/screen).
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {TerminalId}
 */
export function detectTerminal(env = process.env) {
  const termProgram = String(env.TERM_PROGRAM || "");
  const termProgramLower = termProgram.toLowerCase();
  const term = String(env.TERM || "").toLowerCase();
  const terminalName = String(env.TERMINAL_NAME || "").toLowerCase();

  // Specific session IDs first (survive some multiplexer nesting).
  if (env.ITERM_SESSION_ID || termProgram === "iTerm.app") {
    return "iterm2";
  }

  if (env.KITTY_WINDOW_ID || term.includes("kitty")) {
    return "kitty";
  }

  if (
    env.GHOSTTY_RESOURCES_DIR ||
    termProgramLower === "ghostty" ||
    term.includes("ghostty")
  ) {
    return "ghostty";
  }

  if (
    env.WEZTERM_EXECUTABLE ||
    env.WEZTERM_PANE ||
    termProgram === "WezTerm" ||
    term.includes("wezterm")
  ) {
    return "wezterm";
  }

  // Contour exports TERMINAL_NAME=contour and CONTOUR_PROFILE (newer).
  if (
    env.CONTOUR_PROFILE ||
    terminalName === "contour" ||
    term === "contour" ||
    term.startsWith("contour")
  ) {
    return "contour";
  }

  // Windows Terminal (native or WSL).
  if (env.WT_SESSION || env.WT_PROFILE_ID) {
    return "windows-terminal";
  }

  if (env.TILIX_ID) {
    return "tilix";
  }

  if (termProgramLower === "hyper" || termProgram === "Hyper") {
    return "hyper";
  }

  if (env.TABBY_CONFIG_DIRECTORY || termProgramLower === "tabby") {
    return "tabby";
  }

  if (
    env.ALACRITTY_SOCKET ||
    env.ALACRITTY_LOG ||
    termProgramLower === "alacritty" ||
    term.includes("alacritty")
  ) {
    return "alacritty";
  }

  if (env.KONSOLE_VERSION || env.KONSOLE_DBUS_SESSION || termProgramLower === "konsole") {
    return "konsole";
  }

  if (
    termProgram === "Apple_Terminal" ||
    termProgramLower === "apple_terminal" ||
    termProgramLower === "terminal"
  ) {
    return "apple-terminal";
  }

  // VS Code / Cursor integrated terminal.
  if (
    termProgram === "vscode" ||
    termProgramLower === "vscode" ||
    env.VSCODE_INJECTION ||
    env.CURSOR_TRACE_ID ||
    (env.TERM_PROGRAM_VERSION && termProgramLower.includes("cursor"))
  ) {
    return "vscode";
  }

  if (
    env.GNOME_TERMINAL_SCREEN ||
    env.GNOME_TERMINAL_SERVICE ||
    termProgramLower === "gnome-terminal" ||
    terminalName === "ptyxis"
  ) {
    return "gnome-terminal";
  }

  if (
    env.TERMINOLOGY ||
    term.includes("terminology")
  ) {
    return "terminology";
  }

  // tmux/screen alone — not a background host.
  if (env.TMUX || termProgram === "tmux" || term === "screen" || env.STY) {
    return "unsupported";
  }

  return "unsupported";
}

/** Short names for UX lists. */
export const SUPPORTED_TERMINALS = [
  { id: "iterm2", name: "iTerm2", method: "OSC 1337 (live)" },
  { id: "kitty", name: "Kitty", method: "kitty @ set-background-image" },
  { id: "ghostty", name: "Ghostty", method: "config background-image" },
  { id: "wezterm", name: "WezTerm", method: "config window_background_image" },
  { id: "contour", name: "Contour", method: "config background_image" },
  { id: "tilix", name: "Tilix", method: "gsettings background-image" },
  { id: "terminology", name: "Terminology", method: "tybg" },
  { id: "hyper", name: "Hyper", method: ".hyper.js CSS" },
  { id: "tabby", name: "Tabby", method: "config.yaml appearance.css" },
  {
    id: "windows-terminal",
    name: "Windows Terminal",
    method: "settings.json backgroundImage",
  },
  {
    id: "apple-terminal",
    name: "Terminal.app",
    method: "perfil Alquimia + AppleScript (bookmark)",
  },
];
