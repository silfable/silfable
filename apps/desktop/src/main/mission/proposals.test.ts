import { test, describe } from "node:test";
import assert from "node:assert";
import { EventEmitter } from "node:events";
import { MissionProposalService } from "./proposals.js";

class MockObservationService extends EventEmitter {}

describe("MissionProposalService", () => {
  test("generates a draft proposal when auto_execution_triggered fires", async () => {
    const observation = new MockObservationService();
    const service = new MissionProposalService({} as any, observation as any);
    
    let createdEventPayload: any = null;
    service.on("proposal_created", (proposal) => {
      createdEventPayload = proposal;
    });

    observation.emit("auto_execution_triggered", {
      positionId: "pos-1",
      mintAddress: "TokenX",
      reason: "TAKE_PROFIT",
      triggerPrice: 15,
      targetPrice: 10,
      amount: "1000000",
      triggeredAt: new Date().toISOString(),
    });

    // Need to yield to event loop since #handleTrigger is async
    await new Promise((resolve) => setTimeout(resolve, 10));

    const drafts = service.getDrafts();
    assert.equal(drafts.length, 1);
    const draft = drafts[0];
    assert.ok(draft);
    assert.equal(draft.status, "draft");
    assert.equal(draft.inputMint, "TokenX");
    assert.equal(draft.reason, "TAKE_PROFIT");
    
    assert.deepEqual(createdEventPayload, draft);
  });

  test("can approve a draft proposal", async () => {
    const observation = new MockObservationService();
    const service = new MissionProposalService({} as any, observation as any);

    observation.emit("auto_execution_triggered", {
      positionId: "pos-1", mintAddress: "TokenX", reason: "STOP_LOSS", triggerPrice: 15, targetPrice: 10, amount: "1000000", triggeredAt: new Date().toISOString(),
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    
    const draft = service.getDrafts()[0];
    assert.ok(draft);
    const approved = service.approveProposal(draft.id);
    
    assert.notStrictEqual(approved, null);
    assert.strictEqual(approved?.status, "approved");
    assert.strictEqual(service.getDrafts().length, 0); // No longer a draft
  });

  test("can reject a draft proposal", async () => {
    const observation = new MockObservationService();
    const service = new MissionProposalService({} as any, observation as any);

    observation.emit("auto_execution_triggered", {
      positionId: "pos-1", mintAddress: "TokenX", reason: "STOP_LOSS", triggerPrice: 15, targetPrice: 10, amount: "1000000", triggeredAt: new Date().toISOString(),
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    
    const draft = service.getDrafts()[0];
    assert.ok(draft);
    service.rejectProposal(draft.id);
    
    assert.equal(service.getDrafts().length, 0); // No longer a draft
  });
});
