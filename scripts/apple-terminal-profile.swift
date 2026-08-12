#!/usr/bin/env swift
/**
 * Ensure a Terminal.app profile exists with BackgroundImageBookmark for artPath.
 *
 * Usage:
 *   swift apple-terminal-profile.swift <artPath> <profileName> <out.terminal>
 *
 * Writes:
 *   1) ~/.local… Alquimia.terminal (caller-chosen path) for `open` import
 *   2) CFPreferences com.apple.Terminal → Window Settings.<profile>
 *
 * Prints one JSON object to stdout: { ok, wrotePrefs, terminalFile, error? }
 *
 * Note: AppleScript cannot set background images; Terminal stores a security-ish
 * bookmark blob. We create a minimal NSURL bookmark and NSKeyedArchive it the
 * same way exported .terminal files do. If Terminal's sandbox rejects it, the
 * CLI falls back to manual one-time image pick + profile switch.
 */
import Foundation

struct Payload: Codable {
  var ok: Bool
  var wrotePrefs: Bool
  var terminalFile: String?
  var error: String?
}

func emit(_ payload: Payload, exitCode: Int32) -> Never {
  let encoder = JSONEncoder()
  if let data = try? encoder.encode(payload) {
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data([0x0A]))
  }
  exit(exitCode)
}

guard CommandLine.arguments.count >= 4 else {
  emit(
    Payload(
      ok: false,
      wrotePrefs: false,
      terminalFile: nil,
      error: "usage: apple-terminal-profile.swift <artPath> <profileName> <out.terminal>"
    ),
    exitCode: 2
  )
}

let artPath = CommandLine.arguments[1]
let profileName = CommandLine.arguments[2]
let outTerminal = CommandLine.arguments[3]

guard FileManager.default.fileExists(atPath: artPath) else {
  emit(
    Payload(
      ok: false,
      wrotePrefs: false,
      terminalFile: nil,
      error: "art file not found: \(artPath)"
    ),
    exitCode: 1
  )
}

let artURL = URL(fileURLWithPath: artPath)

let bookmark: Data
do {
  // minimalBookmark = path-resilient alias without app security scope.
  // Terminal.app resolves this when loading BackgroundImageBookmark.
  bookmark = try artURL.bookmarkData(
    options: [.minimalBookmark],
    includingResourceValuesForKeys: nil,
    relativeTo: nil
  )
} catch {
  do {
    bookmark = try artURL.bookmarkData(
      options: [],
      includingResourceValuesForKeys: nil,
      relativeTo: nil
    )
  } catch {
    emit(
      Payload(
        ok: false,
        wrotePrefs: false,
        terminalFile: nil,
        error: "bookmarkData failed: \(error.localizedDescription)"
      ),
      exitCode: 1
    )
  }
}

let archivedBookmark: Data
do {
  // Match exported .terminal shape: NSKeyedArchiver root = NSData (bookmark bytes).
  archivedBookmark = try NSKeyedArchiver.archivedData(
    withRootObject: bookmark as NSData,
    requiringSecureCoding: false
  )
} catch {
  emit(
    Payload(
      ok: false,
      wrotePrefs: false,
      terminalFile: nil,
      error: "NSKeyedArchiver failed: \(error.localizedDescription)"
    ),
    exitCode: 1
  )
}

let appID = "com.apple.Terminal" as CFString
let windowKey = "Window Settings" as CFString

var windowSettings =
  (CFPreferencesCopyAppValue(windowKey, appID) as? [String: Any]) ?? [:]

var profile: [String: Any] =
  (windowSettings[profileName] as? [String: Any])
  ?? (windowSettings["Basic"] as? [String: Any])
  ?? (windowSettings["Pro"] as? [String: Any])
  ?? [:]

profile["name"] = profileName
profile["type"] = "Window Settings"
if profile["ProfileCurrentVersion"] == nil {
  profile["ProfileCurrentVersion"] = 2.07
}
profile["BackgroundImageBookmark"] = archivedBookmark
profile["BackgroundBlur"] = 0.0

windowSettings[profileName] = profile
CFPreferencesSetAppValue(windowKey, windowSettings as CFPropertyList, appID)
let wrotePrefs = CFPreferencesAppSynchronize(appID)

// Standalone .terminal import file (root dict = profile).
var terminalProfile = profile
do {
  let outURL = URL(fileURLWithPath: outTerminal)
  try FileManager.default.createDirectory(
    at: outURL.deletingLastPathComponent(),
    withIntermediateDirectories: true,
    attributes: nil
  )
  let plistData = try PropertyListSerialization.data(
    fromPropertyList: terminalProfile,
    format: .xml,
    options: 0
  )
  try plistData.write(to: outURL, options: .atomic)
} catch {
  emit(
    Payload(
      ok: false,
      wrotePrefs: wrotePrefs,
      terminalFile: nil,
      error: "write .terminal failed: \(error.localizedDescription)"
    ),
    exitCode: 1
  )
}

emit(
  Payload(
    ok: true,
    wrotePrefs: wrotePrefs,
    terminalFile: outTerminal,
    error: nil
  ),
  exitCode: 0
)
