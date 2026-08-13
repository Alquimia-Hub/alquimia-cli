import { spawn } from "node:child_process";
import { platform } from "node:os";

/**
 * Open a URL in the default browser (cross-platform, zero deps).
 * Spawns detached so the CLI does not wait on the browser process.
 */
export function openUrl(url: string): Promise<void> {
  const os = platform();
  let command: string;
  let args: string[];

  if (os === "darwin") {
    command = "open";
    args = [url];
  } else if (os === "win32") {
    // `start` is a shell builtin; empty title avoids quoting pitfalls.
    command = "cmd";
    args = ["/c", "start", "", url];
  } else {
    command = "xdg-open";
    args = [url];
  }

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve();
    };

    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
    });

    child.once("error", (err) => done(err));

    // Fail fast if the launcher exits immediately with an error.
    child.once("exit", (code) => {
      if (typeof code === "number" && code !== 0) {
        done(new Error(`${command} exited with code ${code}`));
      }
    });

    // Detach after a brief window so a missing launcher can still fail.
    setTimeout(() => {
      try {
        child.unref();
      } catch {
        // ignore
      }
      done();
    }, 500);
  });
}
