import assert from "node:assert/strict";
import test from "node:test";

import { EmergencyStopService } from "./emergency-stop.js";

class Settings {
  readonly values = new Map<string, unknown>();
  getSetting(key: string): unknown | null { return this.values.get(key) ?? null; }
  setSetting(key: string, value: unknown): void { this.values.set(key, value); }
}

test("emergency stop persists across service instances and blocks execution", () => {
  const settings = new Settings();
  const service = new EmergencyStopService(settings);
  assert.deepEqual(service.get(), { engaged: false, reason: null, engagedAt: null });

  const engaged = service.engage("  suspicious   RPC behavior  ", new Date("2026-07-27T00:00:00.000Z"));
  assert.deepEqual(engaged, {
    engaged: true,
    reason: "suspicious RPC behavior",
    engagedAt: "2026-07-27T00:00:00.000Z",
  });
  assert.throws(() => new EmergencyStopService(settings).assertExecutionAllowed(), /Emergency stop is active/u);
});

test("engage is idempotent and release restores execution", () => {
  const settings = new Settings();
  const service = new EmergencyStopService(settings);
  const first = service.engage("manual halt", new Date("2026-07-27T00:00:00.000Z"));
  const second = service.engage("must not replace evidence", new Date("2026-07-27T01:00:00.000Z"));
  assert.deepEqual(second, first);

  assert.deepEqual(service.release(), { engaged: false, reason: null, engagedAt: null });
  assert.doesNotThrow(() => service.assertExecutionAllowed());
});

test("malformed engaged state fails closed and still blocks execution", () => {
  const settings = new Settings();
  settings.setSetting("security.emergency-stop.v1", { engaged: true, reason: 42, engagedAt: "invalid" });
  assert.deepEqual(new EmergencyStopService(settings).get(), {
    engaged: true,
    reason: "Emergency-stop state requires review",
    engagedAt: "1970-01-01T00:00:00.000Z",
  });
  assert.throws(() => new EmergencyStopService(settings).assertExecutionAllowed(), /requires review/u);
});
