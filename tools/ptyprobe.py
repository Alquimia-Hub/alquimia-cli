"""Dev tool: run the CLI on a real pty behind a fake terminal emulator.

Unit tests use OpenTUI's in-memory test renderer, which skips terminal setup
entirely — so they cannot catch bugs in the *terminal handshake*. This does:
it answers OpenTUI's capability probes (DA1, XTVERSION, DECRQM, OSC 10/11,
CPR, XTWINOPS) the way a real emulator would.

    python3 scripts/ptyprobe.py bun bin/alquimia.ts help

Pair it with OTUI_STDIN_LOG to prove the replies were consumed rather than
leaked to the shell:

    OTUI_STDIN_LOG=/tmp/in.bin python3 scripts/ptyprobe.py bun bin/alquimia.ts help
    wc -c /tmp/in.bin        # 0 bytes == the replies leaked

Env: PTY_TIMEOUT (seconds, default 6).
"""
import fcntl, os, pty, select, struct, subprocess, sys, termios, time

cmd = sys.argv[1:] or ["bun", "bin/alquimia.ts", "help"]
master, slave = pty.openpty()
fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 30, 90, 0, 0))

proc = subprocess.Popen(cmd, stdin=slave, stdout=slave, stderr=slave,
                        env={**os.environ, "ALQUIMIA_NO_UPDATE": "1",
                             "TERM": "xterm-256color"}, close_fds=True)
os.close(slave)

out = b""
answered = set()
start = time.time()
deadline = float(os.environ.get("PTY_TIMEOUT", "6"))

def answer(text):
    """Reply the way a real emulator would."""
    outs = []
    def once(key, data):
        if key not in answered:
            answered.add(key); outs.append(data)
    if "\x1b[c" in text: once("da1", b"\x1b[?62;4c")
    if "\x1b[>0q" in text: once("xtver", b"\x1bP>|xterm.js(6.1.0)\x1b\\")
    for m in ["1016", "2027", "2031", "1004", "2004", "2026"]:
        if f"\x1b[?{m}$p" in text: once("m"+m, f"\x1b[?{m};2$y".encode())
    if "\x1b]10;?" in text: once("fg", b"\x1b]10;rgb:ffff/ffff/ffff\x1b\\")
    if "\x1b]11;?" in text: once("bg", b"\x1b]11;rgb:2828/2c2c/3434\x1b\\")
    if "\x1b[14t" in text: once("size", b"\x1b[4;848;704t")
    if "\x1b[6n" in text: outs.append(b"\x1b[1;1R")
    for o in outs:
        try: os.write(master, o)
        except OSError: pass

while time.time() - start < deadline:
    r, _, _ = select.select([master], [], [], 0.05)
    if r:
        try: chunk = os.read(master, 65536)
        except OSError: break
        if not chunk: break
        out += chunk
        answer(chunk.decode("utf8", "replace"))
    elif proc.poll() is not None:
        break

if proc.poll() is None:
    proc.terminate()
proc.wait()
os.close(master)
sys.stdout.buffer.write(out)
