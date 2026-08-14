import assert from "node:assert/strict";

const endpoint = process.argv[2] ?? "http://127.0.0.1:9333";
const targetDeadline = Date.now() + 30_000;
let target;

while (Date.now() < targetDeadline) {
  try {
    const response = await fetch(endpoint + "/json");
    if (response.ok) {
      const targets = await response.json();
      target = targets.find((candidate) => candidate.type === "page" && candidate.webSocketDebuggerUrl);
      if (target !== undefined) break;
    }
  } catch {
    // Electron may not have opened its renderer target yet.
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}

assert.ok(target?.webSocketDebuggerUrl, "Electron renderer debugging target did not become ready");

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let nextId = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(String(event.data));
  const resolve = pending.get(message.id);
  if (resolve === undefined) return;
  pending.delete(message.id);
  resolve(message);
});

function send(method, params = {}) {
  return new Promise((resolve) => {
    const id = ++nextId;
    pending.set(id, resolve);
    socket.send(JSON.stringify({ id, method, params }));
  });
}

const evaluation = await send("Runtime.evaluate", {
  expression: "document.readyState",
  returnByValue: true,
});
assert.equal(evaluation.error, undefined, "Chrome DevTools protocol evaluation failed");

const rendererDeadline = Date.now() + 30_000;
let result;
let lastEvaluationError;

while (Date.now() < rendererDeadline) {
  const rendererEvaluation = await send("Runtime.evaluate", {
    expression: "JSON.stringify({ bridgeAvailable: typeof window.silfable === 'object', rootHasContent: (document.querySelector('#root')?.textContent?.trim().length ?? 0) > 0, startupFailed: document.querySelector('.startupFailure') !== null, readyState: document.readyState })",
    returnByValue: true,
  });
  lastEvaluationError = rendererEvaluation.error ?? rendererEvaluation.result?.exceptionDetails;
  const value = rendererEvaluation.result?.result?.value;
  if (lastEvaluationError === undefined && typeof value === "string") {
    result = JSON.parse(value);
    if (result.startupFailed || (result.bridgeAvailable && result.rootHasContent)) break;
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}

socket.close();

assert.equal(lastEvaluationError, undefined, "Renderer evaluation failed while waiting for React startup");
assert.ok(result, "Renderer state was unavailable before the startup timeout");
const rendererState = JSON.stringify(result);
assert.equal(result.bridgeAvailable, true, `Secure preload bridge is unavailable: ${rendererState}`);
assert.equal(result.rootHasContent, true, `React renderer root is empty after the startup timeout: ${rendererState}`);
assert.equal(result.startupFailed, false, "Renderer displayed its fail-closed startup fallback");

console.log("Electron renderer root and secure preload bridge are healthy.");
