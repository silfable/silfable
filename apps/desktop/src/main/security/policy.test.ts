import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  assertTrustedIpcEvent,
  denyWindowOpen,
  denyPermissionCheck,
  denyPermissionRequest,
  HARDENED_WEB_PREFERENCES,
  preventRendererNavigation,
} from "./policy";

test("BrowserWindow preferences retain the hardened renderer boundary", () => {
  assert.deepEqual(HARDENED_WEB_PREFERENCES, {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    webviewTag: false,
    allowRunningInsecureContent: false,
    navigateOnDragDrop: false,
  });
});

test("new windows and all renderer navigation are denied", () => {
  assert.deepEqual(denyWindowOpen(), { action: "deny" });
  let prevented = false;
  preventRendererNavigation({ preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
});

test("permission checks and requests are denied without prompting", () => {
  assert.equal(denyPermissionCheck(), false);
  let decision: boolean | null = null;
  denyPermissionRequest(null, "camera", (allowed) => { decision = allowed; });
  assert.equal(decision, false);
});

test("IPC requires the exact main WebContents and its top frame", () => {
  const mainFrame = {};
  const trusted = { isDestroyed: () => false, mainFrame };
  assert.doesNotThrow(() => assertTrustedIpcEvent(
    { sender: trusted, senderFrame: mainFrame } as never,
    trusted as never,
  ));
  assert.throws(() => assertTrustedIpcEvent(
    { sender: {}, senderFrame: mainFrame } as never,
    trusted as never,
  ), /Rejected IPC sender/u);
  assert.throws(() => assertTrustedIpcEvent(
    { sender: trusted, senderFrame: {} } as never,
    trusted as never,
  ), /Rejected IPC sender/u);
  assert.throws(() => assertTrustedIpcEvent(
    { sender: trusted, senderFrame: mainFrame } as never,
    { isDestroyed: () => true, mainFrame } as never,
  ), /Rejected IPC sender/u);
});

test("renderer CSP blocks executable, navigable, and embedded remote surfaces", async () => {
  const html = await readFile(fileURLToPath(new URL("../../renderer/index.html", import.meta.url)), "utf8");
  const csp = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/u)?.[1] ?? "";
  for (const directive of [
    "default-src 'self'",
    "script-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "media-src 'none'",
  ]) assert.ok(csp.includes(directive), `missing CSP directive: ${directive}`);
  assert.equal(csp.includes("script-src 'self' 'unsafe-inline'"), false);
  assert.equal(csp.includes("unsafe-eval"), false);
  assert.equal(csp.includes("http:"), false);
  assert.equal(csp.includes("https:"), false);
});
