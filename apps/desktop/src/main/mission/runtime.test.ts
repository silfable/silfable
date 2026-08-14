import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import { RuntimeDatabase } from "../storage/database.js";
import { EncryptedMissionRuntimeService } from "./runtime.js";

class MemorySecrets {
  value: string | null = null;
  async getSecret(_name: "mission-runtime-store-key"): Promise<string | null> { return this.value; }
  async setSecret(_name: "mission-runtime-store-key", value: string): Promise<void> { this.value = value; }
}

async function fixture(): Promise<{
  path: string;
  database: RuntimeDatabase;
  secrets: MemorySecrets;
  service: EncryptedMissionRuntimeService;
}> {
  const path = join(tmpdir(), `silfable-mission-runtime-${randomUUID()}.sqlite`);
  const database = await RuntimeDatabase.open(path);
  const secrets = new MemorySecrets();
  return { path, database, secrets, service: new EncryptedMissionRuntimeService(database, secrets) };
}

function createInput(sessionId = randomUUID()) {
  return {
    sessionId,
    goal: "Monitor a position and prepare a checkpoint for human review.",
    successCriteria: ["A human confirms the goal has been achieved."],
    stopConditions: ["Stop after the configured maximum step count."],
    maxSteps: 2,
    wakeIntervalSeconds: 60,
    expiresAt: "2026-08-20T00:00:00.000Z",
  };
}

test("durable Mission schedules review-only wakes and resolves its lifecycle", async () => {
  const { path, database, service } = await fixture();
  try {
    const created = await service.create(createInput(), new Date("2026-07-30T00:00:00.000Z"));
    assert.equal(created.status, "ACTIVE");
    assert.equal(created.executionAllowed, false);

    const wakes = await service.evaluate(new Date("2026-07-30T00:01:00.000Z"));
    assert.equal(wakes.length, 1);
    assert.equal(wakes[0]?.status, "AWAITING_REVIEW");

    const continued = await service.resolveWake(
      wakes[0]!.id,
      "CONTINUE",
      "No stop condition matched; continue monitoring.",
      new Date("2026-07-30T00:01:10.000Z"),
    );
    assert.equal(continued.record.status, "ACTIVE");
    assert.equal(continued.record.completedSteps, 1);

    const second = await service.evaluate(new Date("2026-07-30T00:02:10.000Z"));
    const completed = await service.resolveWake(
      second[0]!.id,
      "SUCCEEDED",
      "Success criteria confirmed by the operator.",
      new Date("2026-07-30T00:02:15.000Z"),
    );
    assert.equal(completed.record.status, "COMPLETED");
    assert.equal(completed.record.completedSteps, 2);
  } finally {
    database.close();
    await rm(path, { force: true });
  }
});

test("mission runtime survives restart without storing the goal in plaintext and recovery is idempotent", async () => {
  const { path, database, secrets, service } = await fixture();
  try {
    const input = createInput();
    const created = await service.create(input, new Date("2026-07-30T00:00:00.000Z"));
    database.close();

    const bytes = await readFile(path);
    assert.equal(bytes.includes(Buffer.from(input.goal, "utf8")), false);

    const reopened = await RuntimeDatabase.open(path);
    try {
      const recovered = new EncryptedMissionRuntimeService(reopened, secrets);
      const first = await recovered.recover(new Date("2026-07-30T00:01:00.000Z"));
      const second = await recovered.recover(new Date("2026-07-30T00:01:01.000Z"));
      assert.equal(first.length, 1);
      assert.equal(first[0]?.reason, "RECOVERY_WAKE");
      assert.equal(second.length, 0);
      const state = await recovered.list();
      assert.equal(state.records[0]?.id, created.id);
      assert.equal(state.wakes.length, 1);
    } finally {
      reopened.close();
    }
  } finally {
    await rm(path, { force: true });
  }
});

test("pause, resume, expiry, and emergency stop are fail closed", async () => {
  const { path, database, service } = await fixture();
  try {
    const pausedMission = await service.create(createInput(), new Date("2026-07-30T00:00:00.000Z"));
    assert.equal((await service.action(pausedMission.id, "PAUSE")).status, "PAUSED");
    assert.equal((await service.action(pausedMission.id, "RESUME", new Date("2026-07-30T00:00:10.000Z"))).status, "ACTIVE");

    const expiring = await service.create({
      ...createInput(),
      expiresAt: "2026-07-30T00:02:00.000Z",
    }, new Date("2026-07-30T00:00:00.000Z"));
    await service.evaluate(new Date("2026-07-30T00:03:00.000Z"));
    const expired = (await service.list()).records.find(({ id }) => id === expiring.id);
    assert.equal(expired?.status, "EXPIRED");

    await service.emergencyStop(new Date("2026-07-30T00:04:00.000Z"));
    const stopped = (await service.list()).records.find(({ id }) => id === pausedMission.id);
    assert.equal(stopped?.status, "EMERGENCY_STOPPED");
    assert.equal(stopped?.nextWakeAt, null);
  } finally {
    database.close();
    await rm(path, { force: true });
  }
});
