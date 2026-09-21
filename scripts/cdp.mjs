import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

/**
 * A minimal Chrome DevTools Protocol client, used only by the local
 * verification scripts in this folder. Node 22 ships a global WebSocket, so
 * this needs no dependencies beyond a Chrome install.
 */

const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

export function chromePath() {
  const override = process.env.CHROME_PATH;
  return override ?? CHROME_PATHS[0];
}

export async function launchChrome({ port = 9333 } = {}) {
  const child = spawn(
    chromePath(),
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=/tmp/puff-chrome-${port}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return { child, port };
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  child.kill();
  throw new Error("Chrome never exposed a debugging port");
}

async function pageTarget(port) {
  for (let i = 0; i < 80; i++) {
    const res = await fetch(`http://127.0.0.1:${port}/json/list`);
    const targets = await res.json();
    const page = targets.find((t) => t.type === "page");
    if (page?.webSocketDebuggerUrl) return page;
    await sleep(200);
  }
  throw new Error("No page target available");
}

/** Connects to the page target and returns a small send/evaluate client. */
export async function connect(port, onEvent) {
  const target = await pageTarget(port);

  return await new Promise((resolve, reject) => {
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    let nextId = 0;
    const pending = new Map();

    ws.addEventListener("open", () => resolve(api));
    ws.addEventListener("error", () => reject(new Error("CDP socket error")));
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data.toString());
      if (message.id && pending.has(message.id)) {
        const { resolve: done, reject: fail } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) fail(new Error(message.error.message));
        else done(message.result);
        return;
      }
      if (message.method) onEvent?.(message);
    });

    const api = {
      send(method, params = {}) {
        const id = ++nextId;
        return new Promise((done, fail) => {
          pending.set(id, { resolve: done, reject: fail });
          ws.send(JSON.stringify({ id, method, params }));
        });
      },
      async evaluate(expression) {
        const result = await api.send("Runtime.evaluate", {
          expression,
          awaitPromise: true,
          returnByValue: true,
        });
        if (result.exceptionDetails) {
          throw new Error(
            result.exceptionDetails.exception?.description ??
              result.exceptionDetails.text ??
              "evaluate failed",
          );
        }
        return result.result?.value;
      },
      async goto(url) {
        await api.send("Page.enable");
        await api.send("Page.navigate", { url });
        // Wait for the *commit* first. `document.readyState` alone is not
        // enough: `about:blank`, which the browser opens on, is already
        // `complete` when the navigate is issued — so polling it returns true
        // against the outgoing document and every later call runs on the wrong
        // origin. That shows up as a `localStorage` SecurityError, or worse, as
        // assertions reading the previous page. Polling beats
        // `loadEventFired` for the rest: client components finish hydrating
        // after the load event, and the flows need them live.
        await api.waitFor(
          `(() => { try { return location.href.split('#')[0] !== 'about:blank' && document.readyState === 'complete'; } catch { return false; } })()`,
        );
        // A dev server compiles a route on first request, which can take
        // seconds — long enough for a fixed sleep to lose the race.
        await api.waitFor(
          `(() => { try { return location.href.split('#')[0] === ${JSON.stringify(url.split("#")[0])}; } catch { return false; } })()`,
        );
        await sleep(300);
      },
      async pressKey(key, code, windowsVirtualKeyCode) {
        for (const type of ["keyDown", "keyUp"]) {
          await api.send("Input.dispatchKeyEvent", {
            type,
            key,
            code,
            windowsVirtualKeyCode,
            nativeVirtualKeyCode: windowsVirtualKeyCode,
          });
        }
      },
      /** Polls an expression until it returns truthy. */
      async waitFor(expression, { timeout = 15000, interval = 150 } = {}) {
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
          if (await api.evaluate(expression)) return true;
          await sleep(interval);
        }
        throw new Error(`Timed out waiting for: ${expression}`);
      },
      close: () => ws.close(),
    };
  });
}

export { sleep };
